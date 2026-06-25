import { Global, Module } from '@nestjs/common';
import { LogsController, TracesController } from './observability.controller';
import { ObservabilityService } from './observability.service';
import { LangfuseService } from './langfuse.service';
import { AuditLogService } from './audit-log.service';

@Global()
@Module({
  controllers: [LogsController, TracesController],
  providers: [ObservabilityService, LangfuseService, AuditLogService],
  exports: [ObservabilityService, LangfuseService, AuditLogService],
})
export class ObservabilityModule {}
