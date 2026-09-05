import { Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  type PaginationQuery,
  paginationQuerySchema,
  paginate,
  buildPrismaSkipTake,
} from '../shared/pagination';
import { LangfuseService } from './langfuse.service';
import { AuditEventBroker } from './audit-event.broker';

@Injectable()
export class ObservabilityService {
  constructor(
    private prisma: PrismaService,
    private langfuse: LangfuseService,
    private readonly auditEvents?: AuditEventBroker,
  ) {}

  // ============================================================
  // Logs — backed by AuditLog table
  // ============================================================

  async findAllLogs(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const where = this.buildLogWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    // Map AuditLog → LogEntry shape expected by frontend
    const mapped = items.map((log) => {
      const details = (log.details ?? null) as Record<string, any> | null;
      const status = details?.status ?? null;
      const toolName = details?.toolName ?? null;
      return {
        id: log.id.toString(),
        level:
          status === 'failed' || status === 'denied' || status === 'blocked' ? 'error' : 'info',
        service: log.resourceType ?? 'system',
        message: `${log.action}${log.resourceId ? ` on ${log.resourceType}/${log.resourceId}` : ''}`,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        userId: log.userId,
        traceId: log.traceId,
        status,
        toolName,
        details,
        timestamp: log.createdAt.toISOString(),
      };
    });
    return paginate(mapped, total, pq);
  }

  streamLogs() {
    return this.auditEvents?.stream() ?? new Observable<never>();
  }

  private buildLogWhere(query: unknown): Prisma.AuditLogWhereInput {
    const raw = (query ?? {}) as Record<string, string | undefined>;
    const where: Prisma.AuditLogWhereInput = {};
    if (raw.action) where.action = raw.action;
    if (raw.resourceType) where.resourceType = raw.resourceType;
    if (raw.resourceId) where.resourceId = raw.resourceId;
    if (raw.traceId) where.traceId = raw.traceId;
    if (raw.userId) where.userId = raw.userId;
    if (raw.from || raw.to) {
      where.createdAt = {
        ...(raw.from && { gte: new Date(raw.from) }),
        ...(raw.to && { lte: new Date(raw.to) }),
      };
    }

    const detailFilters: Prisma.AuditLogWhereInput[] = [];
    if (raw.status) detailFilters.push({ details: { path: ['status'], equals: raw.status } });
    if (raw.toolName) detailFilters.push({ details: { path: ['toolName'], equals: raw.toolName } });
    if (raw.riskLevel) {
      detailFilters.push({ details: { path: ['riskLevel'], equals: raw.riskLevel } });
    }
    if (detailFilters.length > 0) where.AND = detailFilters;
    return where;
  }

  // ============================================================
  // Traces — proxy Langfuse
  // ============================================================

  async findAllTraces(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const { items, total } = await this.langfuse.listTraces({
      page: pq.page,
      pageSize: pq.pageSize,
    });
    return paginate(items, total, pq);
  }

  async findTraceById(id: string) {
    const trace = await this.langfuse.getTrace(id);
    if (!trace) {
      throw new NotFoundException(`Trace ${id} not found`);
    }
    return trace;
  }

  async annotateTrace(_id: string, _dto: any) {
    // Langfuse scoring happens at trace creation time inside Agent flow;
    // external annotation from the UI is not yet wired to the SDK.
    throw new NotFoundException(`Trace annotation pending (Phase 3)`);
  }
}
