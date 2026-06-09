import { Injectable, Logger } from '@nestjs/common';
import { K8sService } from './k8s.service';
import {
  buildConfigMap,
  buildDeployment,
  buildSecret,
  buildService,
  ManifestInputs,
  ToolManifest,
  CredentialSecretData,
} from './manifest-builder';
import { buildMcpServerSlug } from './slug';
import { mcpServerSelector } from './labels';

export interface DeployInputs {
  mcpServerId: string;
  openapiSourceId: string;
  sourceName: string;
  serverName: string;
  upstreamBaseUrl: string;
  containerImage: string;
  namespace: string;
  tools: ToolManifest[];
  credentialSecret: CredentialSecretData | null;
}

export interface DeployResult {
  slug: string;
  endpointUrl: string;
  k8s: {
    deployment: string;
    service: string;
    configMap: string;
    secret: string | null;
  };
}

@Injectable()
export class McpServerDeployer {
  private readonly logger = new Logger(McpServerDeployer.name);

  constructor(private readonly k8s: K8sService) {}

  async deploy(input: DeployInputs): Promise<DeployResult> {
    const slug = buildMcpServerSlug(input.sourceName, input.mcpServerId);
    const manifestInputs: ManifestInputs = {
      slug,
      namespace: input.namespace,
      mcpServerId: input.mcpServerId,
      openapiSourceId: input.openapiSourceId,
      upstreamBaseUrl: input.upstreamBaseUrl,
      containerImage: input.containerImage,
      serverName: input.serverName,
      tools: input.tools,
      credentialSecret: input.credentialSecret,
    };

    const cm = buildConfigMap(manifestInputs);
    await this.k8s.applyConfigMap(input.namespace, cm);

    const secret = buildSecret(manifestInputs);
    if (secret) {
      await this.k8s.applySecret(input.namespace, secret);
    }

    const svc = buildService(manifestInputs);
    await this.k8s.applyService(input.namespace, svc);

    const dep = buildDeployment(manifestInputs);
    await this.k8s.applyDeployment(input.namespace, dep);

    const readiness = await this.k8s.waitForDeploymentReady(input.namespace, slug);
    if (!readiness.ready) {
      throw new Error(readiness.message ?? 'Deployment readiness timeout');
    }

    const endpointUrl = `http://${slug}.${input.namespace}.svc.cluster.local:8080/mcp`;
    this.logger.log(`MCP server ${slug} ready at ${endpointUrl}`);

    return {
      slug,
      endpointUrl,
      k8s: {
        deployment: slug,
        service: slug,
        configMap: slug,
        secret: secret ? `${slug}-cred` : null,
      },
    };
  }

  async destroy(params: { mcpServerId: string; namespace: string }): Promise<void> {
    await this.k8s.deleteByLabel(params.namespace, mcpServerSelector(params.mcpServerId));
  }

  async scale(params: { slug: string; namespace: string; replicas: 0 | 1 }): Promise<void> {
    await this.k8s.scaleDeployment(params.namespace, params.slug, params.replicas);
  }

  async deploymentExists(params: { slug: string; namespace: string }): Promise<boolean> {
    return this.k8s.deploymentExists(params.namespace, params.slug);
  }

  async waitForScale(params: {
    slug: string;
    namespace: string;
    expected: number;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; message?: string }> {
    return this.k8s.waitForDeploymentScaled(
      params.namespace,
      params.slug,
      params.expected,
      params.timeoutMs ?? 90_000,
    );
  }

  async fetchLogs(params: {
    mcpServerId: string;
    namespace: string;
    tailLines?: number;
  }): Promise<string> {
    return this.k8s.getPodLogs(
      params.namespace,
      mcpServerSelector(params.mcpServerId),
      params.tailLines ?? 200,
    );
  }
}
