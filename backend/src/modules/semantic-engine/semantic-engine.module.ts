import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  OpenapiSourceController,
  EndpointController,
  McpServerController,
} from './semantic-engine.controller';
import { SemanticEngineService } from './semantic-engine.service';
import { OpenapiParseProcessor } from './processors/openapi-parse.processor';
import { SemanticEnhanceProcessor } from './processors/semantic-enhance.processor';
import { McpGenerateProcessor } from './processors/mcp-generate.processor';
import { LlmConfigModule } from '../llm-config/llm-config.module';
import { AsyncTasksModule } from '../async-tasks/async-tasks.module';
import { K8sService } from './k8s/k8s.service';
import { McpServerDeployer } from './k8s/mcp-server-deployer';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'openapi-parse' },
      { name: 'semantic-enhance' },
      { name: 'mcp-generate' },
    ),
    LlmConfigModule,
    AsyncTasksModule,
  ],
  controllers: [OpenapiSourceController, EndpointController, McpServerController],
  providers: [
    SemanticEngineService,
    OpenapiParseProcessor,
    SemanticEnhanceProcessor,
    McpGenerateProcessor,
    K8sService,
    McpServerDeployer,
  ],
  exports: [SemanticEngineService, McpServerDeployer],
})
export class SemanticEngineModule {}
