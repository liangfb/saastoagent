import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CredentialSyncService } from './credential-sync.service';
import { request } from 'undici';

@Processor('oauth-refresh')
export class OAuthRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(OAuthRefreshProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: CredentialSyncService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const now = new Date();
    const creds = await this.prisma.credential.findMany({
      where: { authType: 'oauth2' },
    });
    for (const c of creds) {
      const cfg = (c.config ?? {}) as Record<string, string>;
      const expiresAt = cfg.expires_at ? new Date(cfg.expires_at) : null;
      if (!expiresAt || expiresAt.getTime() - now.getTime() > 10 * 60 * 1000) continue;
      if (!cfg.refresh_token || !cfg.token_url || !cfg.client_id || !cfg.client_secret) continue;

      try {
        const res = await request(cfg.token_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: cfg.refresh_token,
            client_id: cfg.client_id,
            client_secret: cfg.client_secret,
          }).toString(),
        });
        const payload = (await res.body.json()) as any;
        if (res.statusCode >= 400 || !payload.access_token) {
          this.logger.warn(`refresh failed for credential ${c.id}: ${res.statusCode}`);
          continue;
        }
        const newExpiresAt = new Date(
          Date.now() + (payload.expires_in ?? 3600) * 1000,
        ).toISOString();
        await this.prisma.credential.update({
          where: { id: c.id },
          data: {
            config: {
              ...cfg,
              access_token: payload.access_token,
              refresh_token: payload.refresh_token ?? cfg.refresh_token,
              expires_at: newExpiresAt,
            },
          },
        });
        await this.sync.enqueueSync(c.id);
      } catch (err) {
        this.logger.error(`refresh error for ${c.id}`, err);
      }
    }
  }
}
