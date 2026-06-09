import { Global, Module } from '@nestjs/common';
import { LlmClientService } from './llm-client.service';
import { MastraClientService } from './mastra-client.service';

@Global()
@Module({
  providers: [LlmClientService, MastraClientService],
  exports: [LlmClientService, MastraClientService],
})
export class SharedModule {}
