import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ExecutionContextStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface CreateContextInput {
  sessionId: string;
  messageId?: string | null;
  userId: string;
  traceId: string;
  allowedTools?: string[];
  maxApiCalls?: number;
  maxDurationSeconds?: number;
}

@Injectable()
export class ExecutionContextManager {
  private readonly logger = new Logger(ExecutionContextManager.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateContextInput) {
    return this.prisma.executionContext.create({
      data: {
        sessionId: input.sessionId,
        messageId: input.messageId ?? null,
        userId: input.userId,
        traceId: input.traceId,
        allowedTools: (input.allowedTools ?? []) as Prisma.InputJsonValue,
        maxApiCalls: input.maxApiCalls ?? 50,
        maxDurationSeconds: input.maxDurationSeconds ?? 300,
        status: ExecutionContextStatus.active,
      },
    });
  }

  /**
   * Check + increment a tool call against the context's quota.
   * MVP behavior: records usage, logs a warning when tool is out-of-scope but
   * does NOT hard-block (per SRS FR-3.4 "MVP logs only, no hard enforcement"); blocks when
   * api-call or duration limits are exceeded so runaway loops can't drain budget.
   */
  async recordToolCall(
    contextId: string,
    toolId: string | null,
    toolName: string,
  ): Promise<void> {
    const ctx = await this.prisma.executionContext.findUnique({ where: { id: contextId } });
    if (!ctx) return;

    const allowed = Array.isArray(ctx.allowedTools) ? (ctx.allowedTools as string[]) : [];
    if (allowed.length > 0 && toolId && !allowed.includes(toolId)) {
      this.logger.warn(
        `Agent attempted out-of-scope tool ${toolName} (id=${toolId}) for ctx ${contextId}`,
      );
    }

    if (ctx.currentApiCalls >= ctx.maxApiCalls) {
      await this.terminate(
        contextId,
        ExecutionContextStatus.exceeded_limit,
        `Exceeded max API calls (${ctx.maxApiCalls})`,
      );
      throw new ForbiddenException(
        `Execution context exceeded max API calls (${ctx.maxApiCalls})`,
      );
    }

    const elapsed = (Date.now() - ctx.startedAt.getTime()) / 1000;
    if (elapsed > ctx.maxDurationSeconds) {
      await this.terminate(
        contextId,
        ExecutionContextStatus.timeout,
        `Elapsed ${Math.round(elapsed)}s > limit ${ctx.maxDurationSeconds}s`,
      );
      throw new ForbiddenException(
        `Execution context timed out (>${ctx.maxDurationSeconds}s)`,
      );
    }

    await this.prisma.executionContext.update({
      where: { id: contextId },
      data: { currentApiCalls: { increment: 1 } },
    });
  }

  async complete(contextId: string): Promise<void> {
    await this.prisma.executionContext
      .update({
        where: { id: contextId },
        data: {
          status: ExecutionContextStatus.completed,
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  }

  async terminate(
    contextId: string,
    status: ExecutionContextStatus,
    reason: string,
  ): Promise<void> {
    await this.prisma.executionContext
      .update({
        where: { id: contextId },
        data: {
          status,
          completedAt: new Date(),
          terminationReason: reason,
        },
      })
      .catch(() => undefined);
  }
}
