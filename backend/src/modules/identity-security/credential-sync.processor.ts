import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../core/prisma/prisma.service';
import { K8sService } from '../semantic-engine/k8s/k8s.service';
import { buildSecret } from '../semantic-engine/k8s/manifest-builder';

@Processor('credential-sync')
export class CredentialSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CredentialSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly k8s: K8sService,
  ) {
    super();
  }

  async process(job: Job<{ credentialId: string }>): Promise<void> {
    const { credentialId } = job.data;
    const cred = await this.prisma.credential.findUnique({ where: { id: credentialId } });
    if (!cred) return;

    const sources = await this.prisma.openapiSource.findMany({
      where: { credentialId },
      select: { id: true },
    });
    const sourceIds = sources.map((s) => s.id);
    if (sourceIds.length === 0) return;

    const servers = await this.prisma.mcpServer.findMany({
      where: { openapiSourceId: { in: sourceIds }, status: { in: ['running', 'generating'] } },
    });

    const namespace = process.env.K8S_NAMESPACE ?? 'agentic-mesh';
    for (const server of servers) {
      const cfg = server.serverConfig as any;
      if (!cfg?.k8s?.deployment) continue;
      const cfgData = (cred.config ?? {}) as Record<string, string>;
      let secretData: {
        authType: 'api_key' | 'bearer_token' | 'oauth2';
        data: Record<string, string>;
      } | null = null;
      if (cred.authType === 'api_key') {
        secretData = {
          authType: 'api_key',
          data: {
            API_KEY_NAME: cfgData.key_name ?? '',
            API_KEY_VALUE: cfgData.key_value ?? '',
            API_KEY_LOCATION: cfgData.key_location ?? 'header',
          },
        };
      } else if (cred.authType === 'bearer_token') {
        secretData = {
          authType: 'bearer_token',
          data: { BEARER_TOKEN: cfgData.token ?? '' },
        };
      } else if (cred.authType === 'oauth2') {
        secretData = {
          authType: 'oauth2',
          data: {
            OAUTH_ACCESS_TOKEN: cfgData.access_token ?? '',
            OAUTH_REFRESH_TOKEN: cfgData.refresh_token ?? '',
            OAUTH_EXPIRES_AT: cfgData.expires_at ?? '',
          },
        };
      }
      if (!secretData) continue;

      const secret = buildSecret({
        slug: cfg.k8s.deployment,
        namespace,
        mcpServerId: server.id,
        openapiSourceId: server.openapiSourceId,
        upstreamBaseUrl: cfg.upstreamBaseUrl,
        containerImage: cfg.containerImage,
        serverName: server.name,
        tools: [],
        credentialSecret: secretData,
      });
      if (secret) await this.k8s.applySecret(namespace, secret);

      // Trigger rollout restart via annotation patch
      await this.k8s
        .applyDeployment(namespace, {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: {
            name: cfg.k8s.deployment,
            namespace,
            annotations: { 'agentic-mesh/restartedAt': new Date().toISOString() },
          },
        } as any)
        .catch((err) => this.logger.warn(`restart annotate failed: ${err?.message}`));
    }
  }
}
