import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AsyncTaskStatus, UsageType, type LlmConfig, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AsyncTasksService } from '../../async-tasks/async-tasks.service';
import { LlmConfigService } from '../../llm-config/llm-config.service';
import { LlmClientService } from '../../shared/llm-client.service';
import { McpServerDeployer } from '../k8s/mcp-server-deployer';
import type { ToolManifest } from '../k8s/manifest-builder';
import {
  buildInputSchema,
  buildParameterMapping,
  extractUpstreamBaseUrl,
  k8sNamespace,
  loadCredentialSecret,
  mcpRuntimeImage,
} from '../k8s/manifest-helpers';

interface GenerateJobData {
  sourceId: string;
  taskId: string;
}

/**
 * Builds an McpServer + McpTool[] from an OpenapiSource's endpoints and their
 * latest SemanticDescription. Tool schemas are JSON Schema generated from
 * endpoint parameters + request body.
 */
@Processor('mcp-generate')
export class McpGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(McpGenerateProcessor.name);

  constructor(
    private prisma: PrismaService,
    private asyncTasks: AsyncTasksService,
    private llmConfigService: LlmConfigService,
    private llmClient: LlmClientService,
    private deployer: McpServerDeployer,
  ) {
    super();
  }

  async process(job: Job<GenerateJobData>): Promise<void> {
    const { sourceId, taskId } = job.data;

    try {
      await this.asyncTasks.updateProgress(taskId, {
        status: AsyncTaskStatus.running,
        progress: 5,
      });

      const source = await this.prisma.openapiSource.findUnique({
        where: { id: sourceId },
      });
      if (!source) throw new Error(`OpenAPI source ${sourceId} not found`);

      const endpoints = await this.prisma.endpoint.findMany({
        where: { openapiSourceId: sourceId },
        include: {
          parameters: true,
          semanticDescriptions: { orderBy: { enhancementVersion: 'desc' }, take: 1 },
        },
      });

      if (endpoints.length === 0) {
        throw new Error('No endpoints to generate MCP tools from');
      }

      const existing = await this.prisma.mcpServer.findMany({
        where: { openapiSourceId: sourceId },
        select: { id: true },
      });
      for (const e of existing) {
        await this.deployer.destroy({ mcpServerId: e.id, namespace: k8sNamespace() });
      }
      await this.prisma.mcpServer.deleteMany({ where: { openapiSourceId: sourceId } });

      const llmConfig = await this.llmConfigService
        .findConfigByUsageType(UsageType.semantic_enhancement)
        .catch(() => null);

      const fallbackServerName = this.sanitizeToolName(`${source.name}_mcp`);
      const serverName =
        (await this.generateServerName(llmConfig, source.name)) || fallbackServerName;

      const server = await this.prisma.mcpServer.create({
        data: {
          openapiSourceId: sourceId,
          name: serverName,
          status: 'generating',
          generationConfig: {
            generatedAt: new Date().toISOString(),
            endpointCount: endpoints.length,
          } as Prisma.InputJsonValue,
        },
      });

      await this.asyncTasks.updateProgress(taskId, { progress: 20 });

      // Prefer the stored base URL (set for manual specs / explicit override),
      // falling back to deriving it from the sourceUrl.
      const serverBaseUrl = source.baseUrl ?? extractUpstreamBaseUrl(source.sourceUrl);
      const usedNames = new Set<string>();
      let toolCount = 0;
      const toolManifests: ToolManifest[] = [];

      for (const endpoint of endpoints) {
        const semantic = endpoint.semanticDescriptions[0];
        const rawFallback =
          endpoint.operationId || `${endpoint.httpMethod.toLowerCase()}_${endpoint.path}`;
        const fallbackName = this.sanitizeToolName(rawFallback);
        const llmName = await this.generateToolName(llmConfig, endpoint, semantic);
        const baseName = llmName || fallbackName;
        const toolName = this.uniquify(baseName, usedNames);

        const description = semantic
          ? `${semantic.enhancedSummary}\n\n${semantic.enhancedDescription}`
          : endpoint.summary || endpoint.originalDescription || toolName;

        const inputSchema = buildInputSchema(endpoint.parameters, endpoint.requestSchema);

        await this.prisma.mcpTool.create({
          data: {
            mcpServerId: server.id,
            endpointId: endpoint.id,
            toolName,
            toolDescription: description,
            inputSchema: inputSchema as Prisma.InputJsonValue,
            outputSchema: (endpoint.responseSchema ?? null) as Prisma.InputJsonValue,
            enabledInMcp: true,
          },
        });
        toolCount++;

        toolManifests.push({
          toolName,
          description,
          method: endpoint.httpMethod as ToolManifest['method'],
          path: endpoint.path,
          inputSchema,
          outputSchema: (endpoint.responseSchema ?? null) as Record<string, unknown> | null,
          parameterMapping: buildParameterMapping(endpoint.parameters, endpoint.requestSchema),
        });
      }

      const credentialSecret = await loadCredentialSecret(this.prisma, source.credentialId);

      try {
        const deployResult = await this.deployer.deploy({
          mcpServerId: server.id,
          openapiSourceId: sourceId,
          sourceName: source.name,
          serverName,
          upstreamBaseUrl: serverBaseUrl ?? '',
          containerImage: mcpRuntimeImage(),
          namespace: k8sNamespace(),
          tools: toolManifests,
          credentialSecret,
        });

        await this.prisma.mcpServer.update({
          where: { id: server.id },
          data: {
            status: 'running',
            serverConfig: {
              transport: 'streamable-http',
              upstreamBaseUrl: serverBaseUrl,
              endpointUrl: deployResult.endpointUrl,
              containerImage: mcpRuntimeImage(),
              k8s: deployResult.k8s,
              toolCount,
              lastDeployedAt: new Date().toISOString(),
              toolsConfigDirty: false,
            } as Prisma.InputJsonValue,
          },
        });
      } catch (err: any) {
        await this.prisma.mcpServer.update({
          where: { id: server.id },
          data: {
            status: 'failed',
            errorMessage: err?.message ?? String(err),
          },
        });
        throw err;
      }

      await this.asyncTasks.updateProgress(taskId, {
        status: AsyncTaskStatus.completed,
        progress: 100,
        result: {
          mcpServerId: server.id,
          toolsGenerated: toolCount,
        } as Prisma.InputJsonValue,
      });

      this.logger.log(`Generated MCP server ${server.id} with ${toolCount} tools`);
    } catch (err: any) {
      this.logger.error(`MCP generation failed for source ${sourceId}: ${err.message}`, err.stack);
      await this.asyncTasks.updateProgress(taskId, {
        status: AsyncTaskStatus.failed,
        errorMessage: err.message,
      });
      throw err;
    }
  }

  private sanitizeToolName(raw: string): string {
    return raw
      .replace(/[{}]/g, '')
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .slice(0, 40);
  }

  private uniquify(base: string, used: Set<string>): string {
    let candidate = base || 'tool';
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    let i = 2;
    while (used.has(`${candidate}_${i}`)) i++;
    const result = `${candidate}_${i}`;
    used.add(result);
    return result;
  }

  private async generateToolName(
    llmConfig: LlmConfig | null,
    endpoint: any,
    semantic: any,
  ): Promise<string | null> {
    if (!llmConfig) return null;
    const prompt = [
      `HTTP: ${endpoint.httpMethod} ${endpoint.path}`,
      endpoint.operationId ? `operationId: ${endpoint.operationId}` : '',
      semantic?.enhancedSummary
        ? `Summary: ${semantic.enhancedSummary}`
        : endpoint.summary
          ? `Summary: ${endpoint.summary}`
          : '',
    ]
      .filter(Boolean)
      .join('\n');
    const system = [
      'You name MCP tools. Output ONE snake_case identifier only — no prose, no quotes, no explanation.',
      'Rules: verb-first, 2-4 words, <=32 chars, lowercase letters/digits/underscore only.',
      'Focus on the business action; DROP path prefixes like api, v1, rest, endpoint, handler, method names.',
      'Examples:',
      '  POST /api/v1/journal_entries  "Record a journal entry" -> create_journal_entry',
      '  GET  /api/v1/accounts_payable "AR/AP aging report"      -> list_accounts_payable',
      '  GET  /api/v1/orders/{id}      "Get order details"       -> get_order',
    ].join('\n');
    try {
      const res = await this.llmClient.generateWithConfig(llmConfig, prompt, system);
      const cleaned = this.sanitizeToolName(res.text.split('\n')[0] ?? '');
      return cleaned || null;
    } catch (err: any) {
      this.logger.warn(`LLM tool naming failed, using fallback: ${err.message}`);
      return null;
    }
  }

  private async generateServerName(
    llmConfig: LlmConfig | null,
    sourceName: string,
  ): Promise<string | null> {
    if (!llmConfig) return null;
    const system = [
      'You name MCP servers. Output ONE snake_case identifier only — no prose, no quotes.',
      'Rules: 2-3 words, <=32 chars, lowercase letters/digits/underscore only; end with _mcp.',
      'Capture the business domain; drop filler words like "mock", "service", "api".',
      'Examples:',
      '  "Mock ERP Finance"    -> finance_mcp',
      '  "Sales Order API"     -> sales_order_mcp',
      '  "Product Catalog v2"  -> product_catalog_mcp',
    ].join('\n');
    try {
      const res = await this.llmClient.generateWithConfig(
        llmConfig,
        `Source name: ${sourceName}`,
        system,
      );
      let cleaned = this.sanitizeToolName(res.text.split('\n')[0] ?? '');
      if (cleaned && !cleaned.endsWith('_mcp')) cleaned = `${cleaned}_mcp`.slice(0, 40);
      return cleaned || null;
    } catch (err: any) {
      this.logger.warn(`LLM server naming failed, using fallback: ${err.message}`);
      return null;
    }
  }
}
