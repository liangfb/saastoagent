import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { AsyncTaskStatus, UsageType, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AsyncTasksService } from '../../async-tasks/async-tasks.service';
import { LlmConfigService } from '../../llm-config/llm-config.service';
import { LlmClientService } from '../../shared/llm-client.service';

interface EnhanceJobData {
  sourceId?: string;
  endpointId?: string;
  taskId: string;
}

const SYSTEM_PROMPT = `You are an API semantic enhancement assistant. Given an OpenAPI endpoint definition, produce a rich, business-oriented description that will help an LLM Agent decide when to use this API.

Respond with ONLY a JSON object matching this schema (no markdown fences, no prose):
{
  "enhancedSummary": "One-sentence plain-language summary of what this endpoint does (business perspective).",
  "enhancedDescription": "3-5 sentence detailed description: when to use, what it returns, any side effects, business context.",
  "parameterDescriptions": [
    { "name": "param_name", "description": "business-meaningful description" }
  ],
  "usageExamples": [
    { "scenario": "Natural-language user request that would trigger this endpoint", "arguments": { "example": "value" } }
  ]
}`;

@Processor('semantic-enhance')
export class SemanticEnhanceProcessor extends WorkerHost {
  private readonly logger = new Logger(SemanticEnhanceProcessor.name);

  constructor(
    private prisma: PrismaService,
    private asyncTasks: AsyncTasksService,
    private llmConfigService: LlmConfigService,
    private llmClient: LlmClientService,
    @InjectQueue('mcp-generate') private generateQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<EnhanceJobData>): Promise<void> {
    const { sourceId, endpointId, taskId } = job.data;

    try {
      await this.asyncTasks.updateProgress(taskId, {
        status: AsyncTaskStatus.running,
        progress: 0,
      });

      const llmConfig = await this.llmConfigService.findConfigByUsageType(
        UsageType.semantic_enhancement,
      );

      if (endpointId) {
        await this.enhanceOne(endpointId, llmConfig);
        await this.asyncTasks.updateProgress(taskId, {
          status: AsyncTaskStatus.completed,
          progress: 100,
        });
        return;
      }

      if (!sourceId) throw new Error('Either sourceId or endpointId must be provided');

      const endpoints = await this.prisma.endpoint.findMany({
        where: { openapiSourceId: sourceId },
        include: { parameters: true },
      });

      let done = 0;
      let failed = 0;
      for (const endpoint of endpoints) {
        try {
          await this.enhanceOne(endpoint.id, llmConfig);
        } catch (err: any) {
          this.logger.warn(`Enhancement failed for endpoint ${endpoint.id}: ${err.message}`);
          failed++;
          await this.prisma.endpoint.update({
            where: { id: endpoint.id },
            data: { requiresManualReview: true },
          });
        }
        done++;
        const progress = Math.floor((done / endpoints.length) * 100);
        await this.asyncTasks.updateProgress(taskId, { progress });
      }

      await this.asyncTasks.updateProgress(taskId, {
        status: AsyncTaskStatus.completed,
        progress: 100,
        result: {
          total: endpoints.length,
          succeeded: done - failed,
          failed,
        } as Prisma.InputJsonValue,
      });

      this.logger.log(
        `Enhanced ${done - failed}/${endpoints.length} endpoints for source ${sourceId}; enqueuing MCP generation`,
      );

      const genTask = await this.asyncTasks.create({
        taskType: 'mcp_generate' as any,
        referenceId: sourceId,
      });
      const job2 = await this.generateQueue.add('generate', {
        sourceId,
        taskId: genTask.id,
      });
      await this.prisma.asyncTask.update({
        where: { id: genTask.id },
        data: { bullmqJobId: String(job2.id) },
      });
    } catch (err: any) {
      this.logger.error(`Semantic enhancement failed: ${err.message}`, err.stack);
      await this.asyncTasks.updateProgress(taskId, {
        status: AsyncTaskStatus.failed,
        errorMessage: err.message,
      });
      throw err;
    }
  }

  private async enhanceOne(endpointId: string, llmConfig: any) {
    const endpoint = await this.prisma.endpoint.findUnique({
      where: { id: endpointId },
      include: { parameters: true },
    });
    if (!endpoint) throw new Error(`Endpoint ${endpointId} not found`);

    const prompt = this.buildPrompt(endpoint);
    const response = await this.llmClient.generateWithConfig(llmConfig, prompt, SYSTEM_PROMPT);
    const parsed = this.parseJsonResponse(response.text);

    const latest = await this.prisma.semanticDescription.findFirst({
      where: { endpointId },
      orderBy: { enhancementVersion: 'desc' },
    });
    const version = (latest?.enhancementVersion ?? 0) + 1;

    await this.prisma.semanticDescription.create({
      data: {
        endpointId,
        enhancedSummary: parsed.enhancedSummary ?? endpoint.summary ?? '',
        enhancedDescription: parsed.enhancedDescription ?? endpoint.originalDescription ?? '',
        parameterDescriptions: (parsed.parameterDescriptions ?? []) as Prisma.InputJsonValue,
        usageExamples: (parsed.usageExamples ?? []) as Prisma.InputJsonValue,
        llmModel: `${llmConfig.provider}:${llmConfig.modelId}`,
        llmPromptTemplate: 'v1',
        enhancementVersion: version,
        reviewed: false,
      },
    });
  }

  private buildPrompt(endpoint: any): string {
    return [
      `Endpoint: ${endpoint.httpMethod} ${endpoint.path}`,
      endpoint.operationId ? `Operation ID: ${endpoint.operationId}` : '',
      endpoint.summary ? `Original summary: ${endpoint.summary}` : '',
      endpoint.originalDescription ? `Original description: ${endpoint.originalDescription}` : '',
      endpoint.parameters?.length
        ? `Parameters:\n${endpoint.parameters
            .map(
              (p: any) =>
                `  - ${p.name} (${p.location}, ${p.dataType ?? 'unknown'}${p.required ? ', required' : ''}): ${p.originalDescription ?? ''}`,
            )
            .join('\n')}`
        : '',
      endpoint.requestSchema
        ? `Request schema:\n${JSON.stringify(endpoint.requestSchema, null, 2)}`
        : '',
      endpoint.responseSchema
        ? `Response schema:\n${JSON.stringify(endpoint.responseSchema, null, 2)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseJsonResponse(text: string): any {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('LLM returned non-JSON response');
    }
  }
}
