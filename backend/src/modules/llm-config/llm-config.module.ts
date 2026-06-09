import { Module } from '@nestjs/common';
import { LlmConfigController, LlmAssignmentController } from './llm-config.controller';
import { LlmConfigService } from './llm-config.service';

@Module({
  controllers: [LlmConfigController, LlmAssignmentController],
  providers: [LlmConfigService],
  exports: [LlmConfigService],
})
export class LlmConfigModule {}
