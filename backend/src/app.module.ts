import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from './core/core.module';
import { JwtAuthGuard } from './core/guards/jwt-auth.guard';
import { SharedModule } from './modules/shared/shared.module';
import { AuthModule } from './modules/auth/auth.module';
import { IdentitySecurityModule } from './modules/identity-security/identity-security.module';
import { SemanticEngineModule } from './modules/semantic-engine/semantic-engine.module';
import { AgentNetworkModule } from './modules/agent-network/agent-network.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { LlmConfigModule } from './modules/llm-config/llm-config.module';
import { AsyncTasksModule } from './modules/async-tasks/async-tasks.module';
import { PoliciesModule } from './modules/policies/policies.module';

@Module({
  imports: [
    CoreModule,
    SharedModule,
    AuthModule,
    IdentitySecurityModule,
    SemanticEngineModule,
    AgentNetworkModule,
    ObservabilityModule,
    SessionsModule,
    LlmConfigModule,
    AsyncTasksModule,
    PoliciesModule,
  ],
  providers: [
    // Authenticate every route by default; opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
