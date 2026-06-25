import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  type PaginationQuery,
  paginationQuerySchema,
  paginate,
  buildPrismaSkipTake,
} from '../shared/pagination';
import type { CreateSessionDto } from './dto/session.dto';
import { McpClientService } from '../agent-network/mcp-client/mcp-client.service';
import { McpToolRegistrar } from '../agent-network/mcp-client/mcp-tool-registrar';
import { MemoryService } from '../agent-network/memory/memory.service';
import { MastraClientService } from '../shared/mastra-client.service';
import { createReActAgentInstance } from '../agent-network/agents/react.agent';
import { SessionStreamBroker } from './session-stream.broker';
import { ExecutionContextManager } from './execution-context.manager';
import { LangfuseService } from '../observability/langfuse.service';
import { AuditLogService } from '../observability/audit-log.service';
import { hashForAudit, sanitizeForAudit } from '../observability/audit-log.utils';
import type { McpTool } from '@prisma/client';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

type BindingWithTool = {
  id: string;
  mcpTool: McpTool & { mcpServer: { serverConfig: unknown } };
};

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpClient: McpClientService,
    private readonly registrar: McpToolRegistrar,
    private readonly mastra: MastraClientService,
    private readonly memory: MemoryService,
    private readonly broker: SessionStreamBroker,
    private readonly contexts: ExecutionContextManager,
    private readonly langfuse: LangfuseService,
    private readonly auditLog?: AuditLogService,
  ) {}

  async createSession(dto: CreateSessionDto) {
    return this.prisma.session.create({
      data: {
        userId: dto.userId ?? 'anonymous',
        title: dto.title ?? null,
        agentId: dto.agentId ?? null,
      },
    });
  }

  async findAllSessions(query: unknown, userId: string) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.session.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          agent: { select: { id: true, name: true, agentType: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.session.count({ where }),
    ]);
    return paginate(items, total, pq);
  }

  async findSessionById(id: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true, agentType: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException(`Session ${id} not found`);
    }
    return session;
  }

  async deleteSession(id: string, userId: string) {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session || session.userId !== userId) {
      throw new NotFoundException(`Session ${id} not found`);
    }
    await this.mcpClient.closeSession(id);
    this.broker.complete(id);
    await this.prisma.session.delete({ where: { id } });
    return { deleted: true };
  }

  streamEvents(sessionId: string) {
    return this.broker.stream(sessionId);
  }

  async sendMessage(sessionId: string, dto: { content: string }, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { agent: { include: { llmConfig: true } } },
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    if (!session.agent) throw new BadRequestException('Session has no agent assigned');
    if (!session.agent.llmConfig) {
      throw new BadRequestException('Agent has no LLM config assigned');
    }

    const userMessage = await this.prisma.message.create({
      data: { sessionId, role: 'user', content: dto.content },
    });

    const traceId = randomUUID();
    const context = await this.contexts.create({
      sessionId,
      messageId: userMessage.id,
      userId: session.userId,
      traceId,
    });

    const trace = this.langfuse.startTrace({
      id: traceId,
      name: `session.agent`,
      userId: session.userId,
      sessionId,
      input: { content: dto.content },
      metadata: {
        agentId: session.agent.id,
        agentName: session.agent.name,
      },
      tags: ['agent-network'],
    });

    try {
      // 1. Load memories (best-effort; swallow errors)
      const memoryContext = await this.loadMemoryContext(
        session.userId,
        session.agent.id,
        sessionId,
        dto.content,
      );

      // 2. Build agent tools from MCP bindings
      const { mastraTools, allowedToolIds } = await this.buildAgentTools(
        session.agent.id,
        session.userId,
        sessionId,
        context.id,
        traceId,
        trace,
      );

      if (allowedToolIds.length > 0) {
        await this.prisma.executionContext.update({
          where: { id: context.id },
          data: { allowedTools: allowedToolIds },
        });
      }

      // 3. Compose system prompt with memory
      const systemPrompt = this.buildSystemPrompt(
        session.agent.systemPrompt ?? 'You are a helpful agent.',
        memoryContext,
      );

      // 4. Execute the ReAct agent
      this.broker.emit(sessionId, {
        type: 'thinking',
        data: { content: `Invoking ${session.agent.name}` },
      });

      const model = this.mastra.resolveModel(
        session.agent.llmConfig.provider,
        session.agent.llmConfig.modelId,
      );
      const agent = createReActAgentInstance(
        session.agent.name,
        model,
        systemPrompt,
        mastraTools,
      );

      const generation = trace.generation({
        name: `${session.agent.name}.generate`,
        model: `${session.agent.llmConfig.provider}:${session.agent.llmConfig.modelId}`,
        input: dto.content,
      });

      const result = await (agent as any).generateLegacy(dto.content);
      const responseText: string = result.text ?? '';

      generation.end({ output: responseText, usage: (result as any).usage });

      if (responseText) {
        this.broker.emit(sessionId, {
          type: 'response',
          data: { content: responseText },
        });
      }

      // 5. Persist assistant message
      await this.prisma.message.create({
        data: {
          sessionId,
          role: 'assistant',
          content: responseText,
          metadata: {
            traceId,
            toolCalls: ((result as any).toolCalls ?? []) as any,
            usage: ((result as any).usage ?? null) as any,
          },
        },
      });

      // 6. Store memory (best-effort)
      await this.storeMemory(
        session.userId,
        session.agent.id,
        sessionId,
        dto.content,
        responseText,
      );

      // 7. Finalize
      this.broker.emit(sessionId, {
        type: 'done',
        data: {
          traceId,
          tokenUsage: (result as any).usage ?? null,
        },
      });
      await this.contexts.complete(context.id);
      trace.update({ output: responseText });
      await this.langfuse.flush();

      return {
        content: responseText,
        toolCalls: (result as any).toolCalls ?? [],
        traceId,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`sendMessage failed: ${message}`, (err as Error).stack);
      this.broker.emit(sessionId, { type: 'error', data: { message } });
      await this.contexts
        .terminate(context.id, 'cancelled' as any, message)
        .catch(() => undefined);
      trace.update({ output: null, metadata: { error: message } });
      await this.langfuse.flush();
      throw err;
    }
  }

  // ============================================================
  // Agent tools
  // ============================================================

  private async buildAgentTools(
    agentId: string,
    userId: string,
    sessionId: string,
    contextId: string,
    traceId: string,
    trace: any,
  ): Promise<{ mastraTools: Record<string, any>; allowedToolIds: string[] }> {
    const bindings = (await this.prisma.agentMcpBinding.findMany({
      where: { agentId, enabled: true },
      include: { mcpTool: { include: { mcpServer: true } } },
    })) as unknown as BindingWithTool[];

    const serverTools = new Map<
      string,
      {
        endpointUrl: string;
        tools: Array<{
          toolId: string;
          toolName: string;
          description: string;
          inputSchema: any;
        }>;
      }
    >();
    const allowedToolIds: string[] = [];

    for (const b of bindings) {
      const serverId = b.mcpTool.mcpServerId;
      const cfg = b.mcpTool.mcpServer.serverConfig as { endpointUrl?: string } | null;
      const endpointUrl = cfg?.endpointUrl;
      if (!endpointUrl) continue;
      allowedToolIds.push(b.mcpTool.id);
      if (!serverTools.has(serverId)) {
        serverTools.set(serverId, { endpointUrl, tools: [] });
      }
      serverTools.get(serverId)!.tools.push({
        toolId: b.mcpTool.id,
        toolName: b.mcpTool.toolName,
        description: b.mcpTool.toolDescription,
        inputSchema: b.mcpTool.inputSchema,
      });
    }

    const mastraTools: Record<string, any> = {};
    for (const [serverId, entry] of serverTools.entries()) {
      let client: Client;
      try {
        client = await this.mcpClient.getOrCreate(sessionId, serverId, entry.endpointUrl);
      } catch (err) {
        this.logger.warn(
          `Failed to connect to MCP server ${serverId} at ${entry.endpointUrl}: ${(err as Error).message}`,
        );
        continue;
      }
      for (const t of entry.tools) {
        mastraTools[t.toolName] = this.registrar.toMastraTool(
          client,
          {
            mcpServerId: serverId,
            mcpToolId: t.toolId,
            toolName: t.toolName,
            description: t.description,
            inputSchema: t.inputSchema,
          },
          {
            onBefore: async ({ toolName, args }) => {
              await this.contexts.recordToolCall(contextId, t.toolId, toolName);
              await this.recordToolAudit({
                action: 'tool.call.started',
                userId,
                traceId,
                sessionId,
                agentId,
                mcpServerId: serverId,
                mcpToolId: t.toolId,
                toolName,
                status: 'started',
                args,
              });
              this.broker.emit(sessionId, {
                type: 'tool_call',
                data: { toolName, arguments: args, mcpServerId: serverId },
              });
            },
            onSuccess: async ({ toolName, result, durationMs }) => {
              await this.recordToolAudit({
                action: 'tool.call.succeeded',
                userId,
                traceId,
                sessionId,
                agentId,
                mcpServerId: serverId,
                mcpToolId: t.toolId,
                toolName,
                status: 'succeeded',
                result,
                durationMs,
              });
              this.broker.emit(sessionId, {
                type: 'tool_result',
                data: { toolName, result, durationMs },
              });
              trace
                .span({
                  name: `tool.${toolName}`,
                  input: undefined,
                  output: result,
                  metadata: { durationMs, mcpServerId: serverId },
                })
                .end();
            },
            onError: async ({ toolName, error, durationMs }) => {
              await this.recordToolAudit({
                action: 'tool.call.failed',
                userId,
                traceId,
                sessionId,
                agentId,
                mcpServerId: serverId,
                mcpToolId: t.toolId,
                toolName,
                status: 'failed',
                durationMs,
                error: error.message,
              });
              this.broker.emit(sessionId, {
                type: 'tool_error',
                data: { toolName, message: error.message, durationMs },
              });
              trace
                .span({
                  name: `tool.${toolName}`,
                  metadata: { durationMs, mcpServerId: serverId },
                  level: 'ERROR',
                  statusMessage: error.message,
                })
                .end();
            },
          },
        );
      }
    }
    return { mastraTools, allowedToolIds };
  }

  private async recordToolAudit(input: {
    action: 'tool.call.started' | 'tool.call.succeeded' | 'tool.call.failed';
    userId: string;
    traceId: string;
    sessionId: string;
    agentId: string;
    mcpServerId: string;
    mcpToolId: string;
    toolName: string;
    status: 'started' | 'succeeded' | 'failed';
    args?: unknown;
    result?: unknown;
    durationMs?: number;
    error?: string;
  }) {
    if (!this.auditLog) return;
    const details: Record<string, unknown> = {
      sessionId: input.sessionId,
      agentId: input.agentId,
      mcpServerId: input.mcpServerId,
      mcpToolId: input.mcpToolId,
      toolName: input.toolName,
      status: input.status,
      durationMs: input.durationMs ?? null,
      error: input.error ?? null,
    };
    if (input.args !== undefined) {
      details.argumentsHash = hashForAudit(input.args);
      details.argumentsPreview = sanitizeForAudit(input.args);
    }
    if (input.result !== undefined) {
      details.resultHash = hashForAudit(input.result);
      details.resultPreview = sanitizeForAudit(input.result);
    }

    try {
      await this.auditLog.record({
        action: input.action,
        resourceType: 'mcp_tool',
        resourceId: input.mcpToolId,
        traceId: input.traceId,
        userId: input.userId,
        details,
      });
    } catch (err) {
      this.logger.debug(`Tool audit log failed: ${(err as Error).message}`);
    }
  }

  // ============================================================
  // Memory helpers (best-effort — failure must not break the chat)
  // ============================================================

  private async loadMemoryContext(
    userId: string,
    agentId: string,
    sessionId: string,
    query: string,
  ): Promise<string> {
    try {
      const memories = await this.memory.search({
        query,
        userId,
        agentId,
        runId: sessionId,
        limit: 10,
      });
      if (memories.length === 0) return '';
      return memories.map((m) => `- ${m.memory}`).join('\n');
    } catch (err) {
      this.logger.debug(`Memory search failed: ${(err as Error).message}`);
      return '';
    }
  }

  private async storeMemory(
    userId: string,
    agentId: string,
    sessionId: string,
    userContent: string,
    assistantContent: string,
  ): Promise<void> {
    if (!assistantContent) return;
    try {
      await this.memory.store({
        userId,
        agentId,
        runId: sessionId,
        messages: [
          { role: 'user', content: userContent },
          { role: 'assistant', content: assistantContent },
        ],
      });
    } catch (err) {
      this.logger.debug(`Memory store failed: ${(err as Error).message}`);
    }
  }

  private buildSystemPrompt(base: string, memoryContext: string): string {
    const parts = [base.trim()];
    if (memoryContext) {
      parts.push(`Relevant memory from prior interactions:\n${memoryContext}`);
    }
    return parts.filter(Boolean).join('\n\n');
  }
}
