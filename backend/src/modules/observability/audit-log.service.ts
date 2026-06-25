import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { hashForAudit, sanitizeForAudit } from './audit-log.utils';

export interface AuditLogRecordInput {
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  traceId?: string | null;
  userId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditLogRecordInput) {
    const sanitizedDetails = input.details
      ? (sanitizeForAudit(input.details) as Record<string, unknown>)
      : null;
    const details = sanitizedDetails
      ? ({
          ...sanitizedDetails,
          audit: {
            detailsHash: hashForAudit(input.details),
          },
        } as Prisma.InputJsonValue)
      : undefined;

    return this.prisma.auditLog.create({
      data: {
        traceId: input.traceId ?? randomUUID(),
        userId: input.userId ?? null,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        details,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }
}
