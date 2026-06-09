import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AsyncTaskType, type Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AsyncTasksService } from '../async-tasks/async-tasks.service';
import {
  type PaginationQuery,
  paginationQuerySchema,
  paginate,
  buildPrismaSkipTake,
} from '../shared/pagination';
import type { CreateOpenapiSourceDto, UpdateOpenapiSourceDto } from './dto/openapi-source.dto';
import { McpServerDeployer } from './k8s/mcp-server-deployer';
import type { ToolManifest } from './k8s/manifest-builder';
import {
  buildInputSchema,
  buildParameterMapping,
  extractUpstreamBaseUrl,
  baseUrlFromSpec,
  parseSpecContent,
  k8sNamespace,
  loadCredentialSecret,
  mcpRuntimeImage,
} from './k8s/manifest-helpers';

@Injectable()
export class SemanticEngineService {
  constructor(
    private prisma: PrismaService,
    private asyncTasks: AsyncTasksService,
    @InjectQueue('openapi-parse') private parseQueue: Queue,
    @InjectQueue('semantic-enhance') private enhanceQueue: Queue,
    @InjectQueue('mcp-generate') private generateQueue: Queue,
    private readonly deployer: McpServerDeployer,
  ) {}

  // ============================================================
  // OpenAPI Sources — CRUD
  // ============================================================

  async createOpenapiSource(dto: CreateOpenapiSourceDto) {
    // Manual mode: parse the pasted spec now so we can store it and derive the
    // runtime base URL without ever fetching from a (possibly auth-gated or
    // disabled) spec endpoint.
    let rawSpec: Prisma.InputJsonValue | undefined;
    let baseUrl = dto.baseUrl ?? null;
    let specVersion: string | null = null;

    if (dto.sourceType === 'manual') {
      let parsed: any;
      try {
        parsed = parseSpecContent(dto.specContent as string);
      } catch (err: any) {
        throw new BadRequestException(`Invalid spec content: ${err.message}`);
      }
      rawSpec = parsed as Prisma.InputJsonValue;
      specVersion = parsed.openapi ?? parsed.swagger ?? null;
      baseUrl = baseUrl ?? baseUrlFromSpec(parsed, dto.sourceUrl);
      if (!baseUrl) {
        throw new BadRequestException(
          'Could not determine the API base URL. Provide a Base URL or include servers[] in the spec.',
        );
      }
    } else {
      baseUrl = baseUrl ?? extractUpstreamBaseUrl(dto.sourceUrl);
    }

    return this.prisma.openapiSource.create({
      data: {
        name: dto.name,
        sourceType: dto.sourceType,
        sourceUrl: dto.sourceUrl ?? null,
        baseUrl,
        businessDescription: dto.businessDescription ?? null,
        sopDocument: dto.sopDocument ?? null,
        credentialId: dto.credentialId ?? null,
        ...(rawSpec !== undefined && { rawSpec, specVersion }),
      },
    });
  }

  async previewOpenapiSource(sourceUrl?: string) {
    if (!sourceUrl || typeof sourceUrl !== 'string') {
      throw new BadRequestException('sourceUrl is required');
    }
    let res: Response;
    try {
      res = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/json, application/yaml, text/yaml, */*' },
      });
    } catch (err: any) {
      throw new BadRequestException(`Failed to fetch spec: ${err.message}`);
    }
    if (!res.ok) {
      throw new BadRequestException(`Spec URL returned HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    const raw = await res.text();
    let parsed: unknown = null;
    if (contentType.includes('json') || raw.trimStart().startsWith('{')) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    const openapiVersion = (parsed as any)?.openapi ?? (parsed as any)?.swagger ?? null;
    const title = (parsed as any)?.info?.title ?? null;
    const description = (parsed as any)?.info?.description ?? null;
    const pathCount = parsed ? Object.keys((parsed as any).paths ?? {}).length : null;
    return {
      contentType,
      specVersion: openapiVersion,
      title,
      description,
      pathCount,
      raw,
      parsed,
    };
  }

  async findAllOpenapiSources(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const where = {};
    const [items, total] = await Promise.all([
      this.prisma.openapiSource.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { endpoints: true, mcpServers: true } } },
      }),
      this.prisma.openapiSource.count({ where }),
    ]);
    return paginate(items, total, pq);
  }

  async findOpenapiSourceById(id: string) {
    const source = await this.prisma.openapiSource.findUnique({
      where: { id },
      include: {
        credential: { select: { id: true, name: true, authType: true } },
        _count: { select: { endpoints: true, mcpServers: true } },
      },
    });
    if (!source) throw new NotFoundException(`OpenAPI source ${id} not found`);
    return source;
  }

  async updateOpenapiSource(id: string, dto: UpdateOpenapiSourceDto) {
    const existing = await this.findOpenapiSourceById(id);

    // When new spec content is pasted (manual source), re-parse it so the
    // stored rawSpec / specVersion / derived baseUrl stay consistent.
    const data: Prisma.OpenapiSourceUpdateInput = {};
    if (dto.specContent) {
      let parsed: any;
      try {
        parsed = parseSpecContent(dto.specContent);
      } catch (err: any) {
        throw new BadRequestException(`Invalid spec content: ${err.message}`);
      }
      data.rawSpec = parsed as Prisma.InputJsonValue;
      data.specVersion = parsed.openapi ?? parsed.swagger ?? null;
      const derived = dto.baseUrl ?? baseUrlFromSpec(parsed, dto.sourceUrl ?? existing.sourceUrl);
      if (derived) data.baseUrl = derived;
    }

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.sourceType !== undefined) data.sourceType = dto.sourceType;
    if (dto.sourceUrl !== undefined) data.sourceUrl = dto.sourceUrl ?? null;
    if (dto.baseUrl !== undefined) data.baseUrl = dto.baseUrl ?? null;
    if (dto.businessDescription !== undefined) {
      data.businessDescription = dto.businessDescription ?? null;
    }
    if (dto.sopDocument !== undefined) data.sopDocument = dto.sopDocument ?? null;
    if (dto.credentialId !== undefined) {
      data.credential = dto.credentialId
        ? { connect: { id: dto.credentialId } }
        : { disconnect: true };
    }

    return this.prisma.openapiSource.update({ where: { id }, data });
  }

  async deleteOpenapiSource(id: string) {
    await this.findOpenapiSourceById(id);
    await this.prisma.openapiSource.delete({ where: { id } });
    return { deleted: true };
  }

  async getEndpoints(sourceId: string, query: unknown) {
    await this.findOpenapiSourceById(sourceId);
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const where = { openapiSourceId: sourceId };
    const [items, total] = await Promise.all([
      this.prisma.endpoint.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { path: 'asc' },
        include: { _count: { select: { semanticDescriptions: true } } },
      }),
      this.prisma.endpoint.count({ where }),
    ]);
    return paginate(items, total, pq);
  }

  // ============================================================
  // Async pipeline — enqueue & track
  // ============================================================

  async parseOpenapiSource(id: string) {
    const source = await this.findOpenapiSourceById(id);
    // Manual sources carry the spec in rawSpec; URL/file sources need a URL.
    if (!source.sourceUrl && !source.rawSpec) {
      throw new BadRequestException('OpenAPI source has no sourceUrl or stored spec to parse');
    }
    const task = await this.asyncTasks.create({
      taskType: AsyncTaskType.openapi_parse,
      referenceId: id,
    });
    const job = await this.parseQueue.add('parse', { sourceId: id, taskId: task.id });
    await this.asyncTasks.updateProgress(task.id, {});
    await this.prisma.asyncTask.update({
      where: { id: task.id },
      data: { bullmqJobId: String(job.id) },
    });
    await this.prisma.openapiSource.update({
      where: { id },
      data: { parseStatus: 'parsing' },
    });
    return { taskId: task.id, status: 'pending' };
  }

  async enhanceSource(id: string) {
    const source = await this.findOpenapiSourceById(id);
    if (source.parseStatus !== 'parsed') {
      throw new BadRequestException('OpenAPI source must be parsed before enhancement');
    }
    const task = await this.asyncTasks.create({
      taskType: AsyncTaskType.semantic_enhance,
      referenceId: id,
    });
    const job = await this.enhanceQueue.add('enhance', { sourceId: id, taskId: task.id });
    await this.prisma.asyncTask.update({
      where: { id: task.id },
      data: { bullmqJobId: String(job.id) },
    });
    return { taskId: task.id, status: 'pending' };
  }

  async generateMcp(sourceId: string) {
    await this.findOpenapiSourceById(sourceId);
    const task = await this.asyncTasks.create({
      taskType: AsyncTaskType.mcp_generate,
      referenceId: sourceId,
    });
    const job = await this.generateQueue.add('generate', { sourceId, taskId: task.id });
    await this.prisma.asyncTask.update({
      where: { id: task.id },
      data: { bullmqJobId: String(job.id) },
    });
    return { taskId: task.id, status: 'pending' };
  }

  // ============================================================
  // Single-endpoint enhancement (on-demand)
  // ============================================================

  async enhanceEndpoint(id: string) {
    const endpoint = await this.prisma.endpoint.findUnique({ where: { id } });
    if (!endpoint) throw new NotFoundException(`Endpoint ${id} not found`);
    const task = await this.asyncTasks.create({
      taskType: AsyncTaskType.semantic_enhance,
      referenceId: id,
    });
    const job = await this.enhanceQueue.add('enhance-one', {
      endpointId: id,
      taskId: task.id,
    });
    await this.prisma.asyncTask.update({
      where: { id: task.id },
      data: { bullmqJobId: String(job.id) },
    });
    return { taskId: task.id, status: 'pending' };
  }

  async getSemanticDescription(endpointId: string) {
    const descriptions = await this.prisma.semanticDescription.findMany({
      where: { endpointId },
      orderBy: { enhancementVersion: 'desc' },
      take: 1,
    });
    if (descriptions.length === 0)
      throw new NotFoundException(`No semantic description for endpoint ${endpointId}`);
    return descriptions[0];
  }

  async updateSemanticDescription(endpointId: string, dto: any) {
    const latest = await this.prisma.semanticDescription.findFirst({
      where: { endpointId },
      orderBy: { enhancementVersion: 'desc' },
    });
    if (!latest) throw new NotFoundException(`No semantic description for endpoint ${endpointId}`);
    return this.prisma.semanticDescription.update({
      where: { id: latest.id },
      data: {
        ...(dto.enhancedSummary !== undefined && { enhancedSummary: dto.enhancedSummary }),
        ...(dto.enhancedDescription !== undefined && {
          enhancedDescription: dto.enhancedDescription,
        }),
        ...(dto.parameterDescriptions !== undefined && {
          parameterDescriptions: dto.parameterDescriptions as Prisma.InputJsonValue,
        }),
        ...(dto.usageExamples !== undefined && {
          usageExamples: dto.usageExamples as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async approveSemanticDescription(endpointId: string) {
    const latest = await this.prisma.semanticDescription.findFirst({
      where: { endpointId },
      orderBy: { enhancementVersion: 'desc' },
    });
    if (!latest) throw new NotFoundException(`No semantic description for endpoint ${endpointId}`);
    return this.prisma.semanticDescription.update({
      where: { id: latest.id },
      data: { reviewed: true },
    });
  }

  // ============================================================
  // MCP Servers
  // ============================================================

  async findAllMcpServers(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const openapiSourceId = (query as any)?.openapiSourceId as string | undefined;
    const where: Prisma.McpServerWhereInput = openapiSourceId ? { openapiSourceId } : {};
    const [items, total] = await Promise.all([
      this.prisma.mcpServer.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          openapiSource: { select: { id: true, name: true } },
          _count: { select: { tools: true } },
        },
      }),
      this.prisma.mcpServer.count({ where }),
    ]);
    return paginate(items, total, pq);
  }

  async findMcpServerById(id: string) {
    const server = await this.prisma.mcpServer.findUnique({
      where: { id },
      include: {
        openapiSource: { select: { id: true, name: true } },
        tools: true,
      },
    });
    if (!server) throw new NotFoundException(`MCP Server ${id} not found`);
    return server;
  }

  async startMcpServer(id: string) {
    const server = await this.prisma.mcpServer.findUnique({ where: { id } });
    if (!server) throw new NotFoundException(`MCP server ${id} not found`);

    const namespace = k8sNamespace();
    const slug = (server.serverConfig as any)?.k8s?.deployment;

    // Path A: deployment slug already recorded AND alive in cluster → just scale up.
    if (slug && (await this.deployer.deploymentExists({ slug, namespace }))) {
      return this.scaleUpExisting(id, slug, namespace);
    }

    // Path B: legacy server (no k8s field) OR deployment vanished → deploy from DB.
    return this.deployFromDb(id, namespace);
  }

  private async scaleUpExisting(id: string, slug: string, namespace: string) {
    try {
      await this.deployer.scale({ slug, namespace, replicas: 1 });
      const result = await this.deployer.waitForScale({ slug, namespace, expected: 1 });
      if (!result.ok) {
        await this.prisma.mcpServer.update({
          where: { id },
          data: { status: 'failed', errorMessage: result.message ?? 'Start timed out' },
        });
        throw new BadRequestException(result.message ?? 'Start timed out');
      }
      await this.prisma.mcpServer.update({
        where: { id },
        data: { status: 'running', errorMessage: null },
      });
      return { started: true };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      await this.prisma.mcpServer.update({
        where: { id },
        data: { status: 'failed', errorMessage: msg },
      });
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Start failed: ${msg}`);
    }
  }

  /**
   * Deploy a fresh K8s pod for an MCP server whose Deployment doesn't exist
   * yet (legacy DB rows from before the K8s containerisation work, or rows
   * whose Deployment was manually deleted). Reads tools + endpoint metadata
   * from DB to rebuild the ToolManifest list, fetches the credential, then
   * delegates to McpServerDeployer.deploy() — same path Regenerate uses.
   */
  private async deployFromDb(id: string, namespace: string) {
    await this.prisma.mcpServer.update({
      where: { id },
      data: { status: 'generating', errorMessage: null },
    });

    try {
      const server = await this.prisma.mcpServer.findUniqueOrThrow({
        where: { id },
        include: {
          openapiSource: true,
          tools: {
            include: {
              endpoint: { include: { parameters: true } },
            },
          },
        },
      });

      if (!server.openapiSource) {
        throw new Error('MCP server has no associated OpenAPI source');
      }
      if (server.tools.length === 0) {
        throw new Error('MCP server has no tools to deploy. Run Regenerate first.');
      }

      const upstreamBaseUrl =
        server.openapiSource.baseUrl ??
        extractUpstreamBaseUrl(server.openapiSource.sourceUrl) ??
        '';
      if (!upstreamBaseUrl) {
        throw new Error('Cannot derive upstream base URL from OpenAPI source.');
      }

      const toolManifests: ToolManifest[] = server.tools.map((t) => {
        const ep = t.endpoint;
        // Tools without an endpoint backref are unusable at runtime — fail loud.
        if (!ep) {
          throw new Error(
            `Tool ${t.toolName} is missing endpoint metadata. Run Regenerate on its OpenAPI source.`,
          );
        }
        const inputSchema =
          (t.inputSchema as Record<string, unknown> | null) ??
          buildInputSchema(ep.parameters, ep.requestSchema);
        return {
          toolName: t.toolName,
          description: t.toolDescription,
          method: ep.httpMethod as ToolManifest['method'],
          path: ep.path,
          inputSchema,
          outputSchema: (t.outputSchema ?? null) as Record<string, unknown> | null,
          parameterMapping: buildParameterMapping(ep.parameters, ep.requestSchema),
        };
      });

      const credentialSecret = await loadCredentialSecret(
        this.prisma,
        server.openapiSource.credentialId,
      );

      const containerImage = mcpRuntimeImage();
      const deployResult = await this.deployer.deploy({
        mcpServerId: server.id,
        openapiSourceId: server.openapiSourceId,
        sourceName: server.openapiSource.name,
        serverName: server.name,
        upstreamBaseUrl,
        containerImage,
        namespace,
        tools: toolManifests,
        credentialSecret,
      });

      await this.prisma.mcpServer.update({
        where: { id },
        data: {
          status: 'running',
          errorMessage: null,
          serverConfig: {
            transport: 'streamable-http',
            upstreamBaseUrl,
            endpointUrl: deployResult.endpointUrl,
            containerImage,
            k8s: deployResult.k8s,
            toolCount: toolManifests.length,
            lastDeployedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      return { started: true, deployed: true, endpointUrl: deployResult.endpointUrl };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      await this.prisma.mcpServer.update({
        where: { id },
        data: { status: 'failed', errorMessage: msg },
      });
      throw new BadRequestException(`Start failed: ${msg}`);
    }
  }

  async stopMcpServer(id: string) {
    const server = await this.prisma.mcpServer.findUnique({ where: { id } });
    if (!server) throw new NotFoundException(`MCP server ${id} not found`);
    const slug = (server.serverConfig as any)?.k8s?.deployment;
    if (!slug) {
      // Legacy server with no K8s deployment — just record DB state.
      await this.prisma.mcpServer.update({ where: { id }, data: { status: 'stopped' } });
      return { stopped: true, note: 'No Kubernetes deployment to scale; DB state updated only.' };
    }
    const namespace = process.env.K8S_NAMESPACE ?? 'agentic-mesh';

    if (!(await this.deployer.deploymentExists({ slug, namespace }))) {
      // Deployment already gone (manually deleted, etc.) — converge DB to stopped.
      await this.prisma.mcpServer.update({ where: { id }, data: { status: 'stopped' } });
      return { stopped: true, note: 'Deployment already absent; DB state updated.' };
    }

    try {
      await this.deployer.scale({ slug, namespace, replicas: 0 });
      const result = await this.deployer.waitForScale({
        slug,
        namespace,
        expected: 0,
        timeoutMs: 60_000,
      });
      // Best-effort: even if pods linger past the timeout, DB reflects the user intent.
      const note = result.ok ? undefined : result.message;
      await this.prisma.mcpServer.update({
        where: { id },
        data: { status: 'stopped', errorMessage: null },
      });
      return note ? { stopped: true, note } : { stopped: true };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      throw new BadRequestException(`Stop failed: ${msg}`);
    }
  }

  async getMcpServerLogs(id: string) {
    const server = await this.prisma.mcpServer.findUnique({ where: { id } });
    if (!server) throw new NotFoundException(`MCP server ${id} not found`);
    const logs = await this.deployer.fetchLogs({
      mcpServerId: id,
      namespace: process.env.K8S_NAMESPACE ?? 'agentic-mesh',
    });
    return { logs };
  }

  async getMcpServerTools(id: string) {
    const server = await this.prisma.mcpServer.findUnique({ where: { id } });
    if (!server) throw new NotFoundException(`MCP Server ${id} not found`);
    return this.prisma.mcpTool.findMany({
      where: { mcpServerId: id },
      orderBy: { toolName: 'asc' },
    });
  }
}
