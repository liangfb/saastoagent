import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  type PaginationQuery,
  paginationQuerySchema,
  paginate,
  buildPrismaSkipTake,
} from '../shared/pagination';
import type {
  CreateAgentDto,
  UpdateAgentDto,
  BindMcpDto,
  SetMcpBindingsDto,
} from './dto/agent.dto';

@Injectable()
export class AgentNetworkService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // Agent CRUD
  // ============================================================

  async createAgent(dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        name: dto.name,
        agentType: dto.agentType,
        description: dto.description ?? null,
        systemPrompt: dto.systemPrompt ?? null,
        llmConfigId: dto.llmConfigId ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAllAgents(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const where = {};
    const [items, total] = await Promise.all([
      this.prisma.agent.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { mcpBindings: true, sessions: true } },
        },
      }),
      this.prisma.agent.count({ where }),
    ]);
    return paginate(items, total, pq);
  }

  async findAgentById(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: {
        llmConfig: { select: { id: true, name: true, provider: true, modelId: true } },
        mcpBindings: {
          include: { mcpTool: { select: { id: true, toolName: true, toolDescription: true } } },
        },
        _count: { select: { sessions: true } },
      },
    });
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);
    return agent;
  }

  async updateAgent(id: string, dto: UpdateAgentDto) {
    await this.findAgentById(id);
    return this.prisma.agent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.agentType !== undefined && { agentType: dto.agentType }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.systemPrompt !== undefined && { systemPrompt: dto.systemPrompt ?? null }),
        ...(dto.llmConfigId !== undefined && { llmConfigId: dto.llmConfigId ?? null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteAgent(id: string) {
    await this.findAgentById(id);
    await this.prisma.agent.delete({ where: { id } });
    return { deleted: true };
  }

  // ============================================================
  // MCP Bindings
  // ============================================================

  async bindMcp(agentId: string, dto: BindMcpDto) {
    await this.findAgentById(agentId);
    return this.prisma.agentMcpBinding.create({
      data: {
        agentId,
        mcpToolId: dto.mcpToolId,
      },
      include: { mcpTool: { select: { id: true, toolName: true, toolDescription: true } } },
    });
  }

  async unbindMcp(agentId: string, bindingId: string) {
    const binding = await this.prisma.agentMcpBinding.findFirst({
      where: { id: bindingId, agentId },
    });
    if (!binding)
      throw new NotFoundException(`MCP binding ${bindingId} not found for agent ${agentId}`);
    await this.prisma.agentMcpBinding.delete({ where: { id: bindingId } });
    return { deleted: true };
  }

  /**
   * Replace the full set of MCP tools bound to an agent. Used by the
   * Add/Edit Agent dialog where the user picks tools across multiple servers
   * in one go. Done in a transaction so partial failure leaves no orphans.
   */
  async setMcpBindings(agentId: string, dto: SetMcpBindingsDto) {
    await this.findAgentById(agentId);
    await this.prisma.$transaction(async (tx) => {
      await tx.agentMcpBinding.deleteMany({ where: { agentId } });
      if (dto.mcpToolIds.length > 0) {
        await tx.agentMcpBinding.createMany({
          data: dto.mcpToolIds.map((mcpToolId) => ({ agentId, mcpToolId })),
          skipDuplicates: true,
        });
      }
    });
    return this.prisma.agentMcpBinding.findMany({
      where: { agentId },
      include: { mcpTool: { select: { id: true, toolName: true, toolDescription: true } } },
    });
  }
}
