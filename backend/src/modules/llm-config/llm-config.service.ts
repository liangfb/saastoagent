import { Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, type UsageType } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  type PaginationQuery,
  paginationQuerySchema,
  paginate,
  buildPrismaSkipTake,
} from '../shared/pagination';
import type {
  CreateLlmConfigDto,
  UpdateLlmConfigDto,
  UpdateAssignmentsDto,
} from './dto/llm-config.dto';

@Injectable()
export class LlmConfigService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // LLM Configs
  // ============================================================

  async createLlmConfig(dto: CreateLlmConfigDto) {
    return this.prisma.llmConfig.create({
      data: {
        name: dto.name,
        provider: dto.provider,
        modelId: dto.modelId,
        apiEndpoint: dto.apiEndpoint ?? null,
        credentials: (dto.credentials ?? {}) as Prisma.InputJsonValue,
        region: dto.region ?? null,
        defaultParams: (dto.defaultParams ?? {}) as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAllLlmConfigs(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const where = {};
    const [items, total] = await Promise.all([
      this.prisma.llmConfig.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { agents: true, assignments: true } } },
      }),
      this.prisma.llmConfig.count({ where }),
    ]);
    // Mask credentials in response
    const maskedItems = items.map((item) => ({
      ...item,
      credentials: Object.fromEntries(
        Object.entries(item.credentials as Record<string, unknown>).map(([k, v]) => [
          k,
          typeof v === 'string' && v.length > 4 ? v.slice(0, 4) + '****' : '****',
        ]),
      ),
    }));
    return paginate(maskedItems, total, pq);
  }

  async findLlmConfigById(id: string) {
    const config = await this.prisma.llmConfig.findUnique({
      where: { id },
      include: { _count: { select: { agents: true, assignments: true } } },
    });
    if (!config) throw new NotFoundException(`LLM config ${id} not found`);
    return config;
  }

  async updateLlmConfig(id: string, dto: UpdateLlmConfigDto) {
    await this.findLlmConfigById(id);
    return this.prisma.llmConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.provider !== undefined && { provider: dto.provider }),
        ...(dto.modelId !== undefined && { modelId: dto.modelId }),
        ...(dto.apiEndpoint !== undefined && { apiEndpoint: dto.apiEndpoint ?? null }),
        ...(dto.credentials !== undefined && {
          credentials: dto.credentials as Prisma.InputJsonValue,
        }),
        ...(dto.region !== undefined && { region: dto.region ?? null }),
        ...(dto.defaultParams !== undefined && {
          defaultParams: dto.defaultParams as Prisma.InputJsonValue,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteLlmConfig(id: string) {
    await this.findLlmConfigById(id);
    await this.prisma.llmConfig.delete({ where: { id } });
    return { deleted: true };
  }

  async testLlmConfig(id: string) {
    const config = await this.prisma.llmConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException(`LLM config ${id} not found`);
    // MVP: validate config has credentials
    const creds = config.credentials as Record<string, unknown>;
    const hasCredentials = Object.keys(creds).length > 0;
    return {
      reachable: hasCredentials,
      provider: config.provider,
      modelId: config.modelId,
      message: hasCredentials ? 'Configuration looks valid' : 'No credentials configured',
    };
  }

  // ============================================================
  // LLM Assignments
  // ============================================================

  async getAssignments() {
    return this.prisma.llmModelAssignment.findMany({
      include: {
        llmConfig: { select: { id: true, name: true, provider: true, modelId: true } },
        fallbackLlmConfig: { select: { id: true, name: true, provider: true, modelId: true } },
      },
    });
  }

  /**
   * Internal-only: resolve the LlmConfig (with unmasked credentials) assigned
   * to a given UsageType. Used by BullMQ processors — never expose to HTTP.
   */
  async findConfigByUsageType(usageType: UsageType) {
    const assignment = await this.prisma.llmModelAssignment.findUnique({
      where: { usageType },
      include: { llmConfig: true, fallbackLlmConfig: true },
    });
    if (!assignment) {
      throw new NotFoundException(`No LLM config assigned for usage type: ${usageType}`);
    }
    return assignment.llmConfig;
  }

  async updateAssignments(dto: UpdateAssignmentsDto) {
    await this.prisma.$transaction(async (tx) => {
      for (const a of dto.assignments) {
        await tx.llmModelAssignment.upsert({
          where: { usageType: a.usageType },
          create: {
            usageType: a.usageType,
            llmConfigId: a.llmConfigId,
            fallbackLlmConfigId: a.fallbackLlmConfigId ?? null,
          },
          update: {
            llmConfigId: a.llmConfigId,
            fallbackLlmConfigId: a.fallbackLlmConfigId ?? null,
          },
        });
      }
    });
    return this.getAssignments();
  }
}
