import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  type PaginationQuery,
  paginationQuerySchema,
  paginate,
  buildPrismaSkipTake,
} from '../shared/pagination';
import { LangfuseService } from './langfuse.service';

@Injectable()
export class ObservabilityService {
  constructor(
    private prisma: PrismaService,
    private langfuse: LangfuseService,
  ) {}

  // ============================================================
  // Logs — backed by AuditLog table
  // ============================================================

  async findAllLogs(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const where = {};
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    // Map AuditLog → LogEntry shape expected by frontend
    const mapped = items.map((log) => ({
      id: log.id.toString(),
      level: 'info',
      service: log.resourceType ?? 'system',
      message: `${log.action}${log.resourceId ? ` on ${log.resourceType}/${log.resourceId}` : ''}`,
      traceId: log.traceId,
      timestamp: log.createdAt.toISOString(),
    }));
    return paginate(mapped, total, pq);
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
