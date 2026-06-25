import { Global, Module } from '@nestjs/common';
import { LogsController, TracesController } from './observability.controller';
import { ObservabilityService } from './observability.service';
import { LangfuseService } from './langfuse.service';
import { AuditLogService } from './audit-log.service';
import { AuditEventBroker } from './audit-event.broker';

@Global()
@Module({
  controllers: [LogsController, TracesController],
  providers: [ObservabilityService, LangfuseService, AuditLogService, AuditEventBroker],
  exports: [ObservabilityService, LangfuseService, AuditLogService, AuditEventBroker],
})
export class ObservabilityModule {}
