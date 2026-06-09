import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IdentitySecurityController } from './identity-security.controller';
import { IdentitySecurityService } from './identity-security.service';
import { CredentialSyncService } from './credential-sync.service';
import { CredentialSyncProcessor } from './credential-sync.processor';
import { OAuthRefreshScheduler } from './oauth-refresh.scheduler';
import { OAuthRefreshProcessor } from './oauth-refresh.processor';
import { K8sService } from '../semantic-engine/k8s/k8s.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'credential-sync' }),
    BullModule.registerQueue({ name: 'oauth-refresh' }),
  ],
  controllers: [IdentitySecurityController],
  providers: [
    IdentitySecurityService,
    CredentialSyncService,
    CredentialSyncProcessor,
    OAuthRefreshScheduler,
    OAuthRefreshProcessor,
    K8sService,
  ],
  exports: [IdentitySecurityService, CredentialSyncService],
})
export class IdentitySecurityModule {}
