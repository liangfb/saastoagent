import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionStreamBroker } from './session-stream.broker';
import { ExecutionContextManager } from './execution-context.manager';
import { AgentNetworkModule } from '../agent-network/agent-network.module';
import { PoliciesModule } from '../policies/policies.module';

@Module({
  imports: [AgentNetworkModule, PoliciesModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionStreamBroker, ExecutionContextManager],
  exports: [SessionsService],
})
export class SessionsModule {}
