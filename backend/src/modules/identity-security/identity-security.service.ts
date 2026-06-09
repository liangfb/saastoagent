import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CredentialSyncService } from './credential-sync.service';
import {
  type PaginationQuery,
  paginationQuerySchema,
  paginate,
  buildPrismaSkipTake,
} from '../shared/pagination';
import type { CreateCredentialDto, UpdateCredentialDto } from './dto/credential.dto';

/** Mask sensitive fields in credential config */
function maskConfig(config: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string' && value.length > 4) {
      masked[key] = value.slice(0, 4) + '****';
    } else {
      masked[key] = '****';
    }
  }
  return masked;
}

@Injectable()
export class IdentitySecurityService {
  constructor(
    private prisma: PrismaService,
    private readonly sync: CredentialSyncService,
  ) {}

  async createCredential(dto: CreateCredentialDto) {
    const created = await this.prisma.credential.create({
      data: {
        name: dto.name,
        authType: dto.authType,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        status: dto.status ?? 'active',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    return { ...created, config: maskConfig(created.config as Record<string, unknown>) };
  }

  async findAllCredentials(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const where = {};
    const [items, total] = await Promise.all([
      this.prisma.credential.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.credential.count({ where }),
    ]);
    const maskedItems = items.map((item) => ({
      ...item,
      config: maskConfig(item.config as Record<string, unknown>),
    }));
    return paginate(maskedItems, total, pq);
  }

  async findCredentialById(id: string) {
    const cred = await this.prisma.credential.findUnique({ where: { id } });
    if (!cred) throw new NotFoundException(`Credential ${id} not found`);
    return {
      ...cred,
      config: maskConfig(cred.config as Record<string, unknown>),
    };
  }

  /**
   * Return the credential with its UNMASKED config. Used by the UI's reveal /
   * edit flows. Masked config is lossy and can't be reversed client-side.
   */
  async revealCredential(id: string) {
    const cred = await this.prisma.credential.findUnique({ where: { id } });
    if (!cred) throw new NotFoundException(`Credential ${id} not found`);
    return cred;
  }

  async updateCredential(id: string, dto: UpdateCredentialDto) {
    await this.findCredentialById(id);
    const updated = await this.prisma.credential.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.authType !== undefined && { authType: dto.authType }),
        ...(dto.config !== undefined && { config: dto.config as Prisma.InputJsonValue }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
      },
    });
    await this.sync.enqueueSync(id);
    return { ...updated, config: maskConfig(updated.config as Record<string, unknown>) };
  }

  async deleteCredential(id: string) {
    await this.findCredentialById(id);
    const refCount = await this.prisma.openapiSource.count({ where: { credentialId: id } });
    if (refCount > 0) {
      throw new ConflictException('Credential is still referenced by OpenAPI sources');
    }
    await this.prisma.credential.delete({ where: { id } });
    return { deleted: true };
  }

  async testCredential(id: string) {
    const cred = await this.prisma.credential.findUnique({ where: { id } });
    if (!cred) throw new NotFoundException(`Credential ${id} not found`);
    // MVP: basic validation that config is non-empty
    const config = cred.config as Record<string, unknown>;
    const hasKeys = Object.keys(config).length > 0;
    return {
      reachable: hasKeys,
      message: hasKeys ? 'Credential config is present' : 'Credential config is empty',
    };
  }
}
