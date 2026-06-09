import { Global, Module } from '@nestjs/common';
import { LogsController, TracesController } from './observability.controller';
import { ObservabilityService } from './observability.service';
import { LangfuseService } from './langfuse.service';

@Global()
@Module({
  controllers: [LogsController, TracesController],
  providers: [ObservabilityService, LangfuseService],
  exports: [ObservabilityService, LangfuseService],
})
export class ObservabilityModule {}
