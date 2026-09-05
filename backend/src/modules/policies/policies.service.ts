import { Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditLogService } from '../observability/audit-log.service';
import {
  buildPrismaSkipTake,
  paginate,
  paginationQuerySchema,
  type PaginationQuery,
} from '../shared/pagination';
import type { CreatePolicyDto, UpdatePolicyDto } from './dto/policy.dto';

@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog?: AuditLogService,
  ) {}

  async create(dto: CreatePolicyDto, userId: string) {
    const policy = await this.prisma.policy.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        enabled: dto.enabled,
        priority: dto.priority,
        scope: dto.scope as Prisma.InputJsonValue,
        rules: dto.rules as unknown as Prisma.InputJsonValue,
      },
    });
    await this.recordChange('policy.created', policy.id, userId, policy.version);
    return policy;
  }

  async findAll(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const raw = (query ?? {}) as Record<string, string | undefined>;
    const where: Prisma.PolicyWhereInput = {};
    if (raw.enabled === 'true') where.enabled = true;
    if (raw.enabled === 'false') where.enabled = false;

    const [items, total] = await Promise.all([
      this.prisma.policy.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.policy.count({ where }),
    ]);
    return paginate(items, total, pq);
  }

  async findOne(id: string) {
    const policy = await this.prisma.policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException(`Policy ${id} not found`);
    return policy;
  }

  async update(id: string, dto: UpdatePolicyDto, userId: string) {
    await this.findOne(id);
    const policy = await this.prisma.policy.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.scope !== undefined && { scope: dto.scope as Prisma.InputJsonValue }),
        ...(dto.rules !== undefined && {
          rules: dto.rules as unknown as Prisma.InputJsonValue,
        }),
        version: { increment: 1 },
      },
    });
    await this.recordChange('policy.updated', policy.id, userId, policy.version);
    return policy;
  }

  async remove(id: string, userId: string) {
    const policy = await this.findOne(id);
    await this.prisma.policy.delete({ where: { id } });
    await this.recordChange('policy.deleted', id, userId, policy.version);
    return { deleted: true };
  }

  private async recordChange(action: string, policyId: string, userId: string, version: number) {
    await this.auditLog
      ?.record({
        action,
        resourceType: 'policy',
        resourceId: policyId,
        userId,
        details: { version, status: 'succeeded' },
      })
      .catch(() => undefined);
  }
}
