// Stub the K8s ESM client so jest can transform the import chain.
// SemanticEngineService imports McpServerDeployer which imports K8sService.
jest.mock('@kubernetes/client-node', () => ({
  KubeConfig: jest.fn().mockImplementation(() => ({
    loadFromCluster: jest.fn(),
    loadFromDefault: jest.fn(),
    makeApiClient: jest.fn().mockReturnValue({}),
  })),
  CoreV1Api: jest.fn(),
  AppsV1Api: jest.fn(),
  V1ConfigMap: jest.fn(),
  V1Deployment: jest.fn(),
  V1Secret: jest.fn(),
  V1Service: jest.fn(),
  V1Pod: jest.fn(),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SemanticEngineService } from './semantic-engine.service';

const ID = '11111111-1111-1111-1111-111111111111';
const SOURCE_ID = '22222222-2222-2222-2222-222222222222';
const SLUG = 'mcp-finance-abcdef';

interface ServiceOpts {
  serverConfig?: unknown;
  serverFound?: boolean;
  exists?: boolean;
  scaleResult?: { ok: boolean; message?: string };
  /** Tools fed to findUniqueOrThrow include in the deploy path */
  tools?: any[];
  /** Source object returned by include in the deploy path */
  openapiSource?: any;
  deployResult?: { endpointUrl: string; k8s: any; slug: string };
  deployRejects?: Error;
  serverTools?: any[];
}

function makeService(opts: ServiceOpts = {}) {
  const server =
    opts.serverFound === false
      ? null
      : {
          id: ID,
          name: 'finance_mcp',
          openapiSourceId: SOURCE_ID,
          status: 'stopped',
          serverConfig: opts.serverConfig ?? { k8s: { deployment: SLUG } },
          tools: opts.serverTools ?? [{ id: 'tool-1', enabledInMcp: true }],
        };

  // Per-call findUniqueOrThrow result for the deploy path.
  const fullServer = {
    ...(server ?? {}),
    openapiSource: opts.openapiSource ?? {
      id: SOURCE_ID,
      name: 'Finance API',
      sourceUrl: 'http://mock-erp-finance:9005/openapi.json',
      credentialId: null,
    },
    tools: opts.tools ?? [
      {
        toolName: 'list_accounts',
        toolDescription: 'List accounts',
        enabledInMcp: true,
        inputSchema: { type: 'object', properties: {} },
        outputSchema: null,
        endpoint: {
          httpMethod: 'GET',
          path: '/accounts',
          requestSchema: null,
          parameters: [],
        },
      },
    ],
  };

  const prisma = {
    $transaction: jest.fn(async (operations) => Promise.all(operations)),
    mcpServer: {
      findUnique: jest.fn().mockResolvedValue(server),
      findUniqueOrThrow: jest.fn().mockResolvedValue(fullServer),
      update: jest.fn().mockResolvedValue(server),
    },
    mcpTool: {
      update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      findMany: jest.fn().mockResolvedValue(opts.serverTools ?? server?.tools ?? []),
    },
    credential: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const deployer = {
    deploymentExists: jest.fn().mockResolvedValue(opts.exists ?? true),
    scale: jest.fn().mockResolvedValue(undefined),
    waitForScale: jest.fn().mockResolvedValue(opts.scaleResult ?? { ok: true }),
    deploy: opts.deployRejects
      ? jest.fn().mockRejectedValue(opts.deployRejects)
      : jest.fn().mockResolvedValue(
          opts.deployResult ?? {
            slug: SLUG,
            endpointUrl: `http://${SLUG}.agentic-mesh.svc.cluster.local:8080/mcp`,
            k8s: { deployment: SLUG, service: SLUG, configMap: SLUG, secret: null },
          },
        ),
    destroy: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new SemanticEngineService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    deployer as any,
  );
  return { svc, prisma, deployer };
}

describe('SemanticEngineService.startMcpServer — scale path (deployment alive)', () => {
  it('throws NotFound when server does not exist', async () => {
    const { svc } = makeService({ serverFound: false });
    await expect(svc.startMcpServer(ID)).rejects.toThrow(NotFoundException);
  });

  it('scales to 1 then waits for ready replicas before flipping status to running', async () => {
    const { svc, deployer, prisma } = makeService();
    const result = await svc.startMcpServer(ID);
    expect(result).toEqual({ started: true });
    expect(deployer.scale).toHaveBeenCalledWith({
      slug: SLUG,
      namespace: expect.any(String),
      replicas: 1,
    });
    expect(deployer.waitForScale).toHaveBeenCalledWith(
      expect.objectContaining({ expected: 1, slug: SLUG }),
    );
    expect(deployer.deploy).not.toHaveBeenCalled();
    expect(prisma.mcpServer.update).toHaveBeenLastCalledWith({
      where: { id: ID },
      data: { status: 'running', errorMessage: null },
    });
  });

  it('records errorMessage and marks failed when waitForScale times out', async () => {
    const { svc, prisma } = makeService({ scaleResult: { ok: false, message: 'timed out' } });
    await expect(svc.startMcpServer(ID)).rejects.toThrow(BadRequestException);
    expect(prisma.mcpServer.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { status: 'failed', errorMessage: 'timed out' },
    });
  });
});

describe('SemanticEngineService.startMcpServer — deploy path (no deployment yet)', () => {
  it('deploys from DB when server has no k8s field (legacy row)', async () => {
    const { svc, deployer, prisma } = makeService({
      serverConfig: { baseUrl: 'http://legacy', toolCount: 3, transport: 'http' },
    });
    const result = await svc.startMcpServer(ID);
    expect(result.started).toBe(true);
    expect((result as any).deployed).toBe(true);
    expect(deployer.deploy).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServerId: ID,
        openapiSourceId: SOURCE_ID,
        sourceName: 'Finance API',
        upstreamBaseUrl: 'http://mock-erp-finance:9005',
        tools: expect.arrayContaining([
          expect.objectContaining({ toolName: 'list_accounts', method: 'GET', path: '/accounts' }),
        ]),
      }),
    );
    // First update sets generating, last update sets running with serverConfig.
    expect(prisma.mcpServer.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { status: 'generating', errorMessage: null },
    });
    expect(prisma.mcpServer.update).toHaveBeenLastCalledWith({
      where: { id: ID },
      data: expect.objectContaining({
        status: 'running',
        serverConfig: expect.objectContaining({
          endpointUrl: expect.stringContaining('/mcp'),
          k8s: expect.objectContaining({ deployment: SLUG }),
        }),
      }),
    });
    expect(deployer.scale).not.toHaveBeenCalled();
  });

  it('deploys from DB when k8s field exists but cluster has no deployment', async () => {
    const { svc, deployer } = makeService({ exists: false });
    const result = await svc.startMcpServer(ID);
    expect(result.started).toBe(true);
    expect(deployer.deploy).toHaveBeenCalledTimes(1);
    expect(deployer.scale).not.toHaveBeenCalled();
  });

  it('redeploys instead of scaling when tool configuration is dirty', async () => {
    const { svc, deployer } = makeService({
      serverConfig: { k8s: { deployment: SLUG }, toolsConfigDirty: true },
    });
    const result = await svc.startMcpServer(ID);
    expect(result.started).toBe(true);
    expect((result as any).deployed).toBe(true);
    expect(deployer.deploy).toHaveBeenCalledTimes(1);
    expect(deployer.scale).not.toHaveBeenCalled();
  });

  it('deploys only tools enabled in MCP', async () => {
    const { svc, deployer, prisma } = makeService({
      exists: false,
      tools: [
        {
          toolName: 'enabled_tool',
          toolDescription: 'Enabled',
          enabledInMcp: true,
          inputSchema: { type: 'object', properties: {} },
          outputSchema: null,
          endpoint: {
            httpMethod: 'GET',
            path: '/enabled',
            requestSchema: null,
            parameters: [],
          },
        },
        {
          toolName: 'disabled_tool',
          toolDescription: 'Disabled',
          enabledInMcp: false,
          inputSchema: { type: 'object', properties: {} },
          outputSchema: null,
          endpoint: {
            httpMethod: 'GET',
            path: '/disabled',
            requestSchema: null,
            parameters: [],
          },
        },
      ],
    });
    await svc.startMcpServer(ID);
    expect(deployer.deploy).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [expect.objectContaining({ toolName: 'enabled_tool' })],
      }),
    );
    expect(prisma.mcpServer.update).toHaveBeenLastCalledWith({
      where: { id: ID },
      data: expect.objectContaining({
        serverConfig: expect.objectContaining({
          toolCount: 1,
          toolsConfigDirty: false,
        }),
      }),
    });
  });

  it('marks server failed when deploy throws', async () => {
    const { svc, prisma } = makeService({
      exists: false,
      deployRejects: new Error('image pull backoff'),
    });
    await expect(svc.startMcpServer(ID)).rejects.toThrow(/image pull backoff/);
    expect(prisma.mcpServer.update).toHaveBeenLastCalledWith({
      where: { id: ID },
      data: { status: 'failed', errorMessage: 'image pull backoff' },
    });
  });

  it('rejects when MCP server has no tools to deploy', async () => {
    const { svc } = makeService({ exists: false, tools: [] });
    await expect(svc.startMcpServer(ID)).rejects.toThrow(/no tools/i);
  });

  it('rejects when source has no sourceUrl to derive upstream base url', async () => {
    const { svc } = makeService({
      exists: false,
      openapiSource: {
        id: SOURCE_ID,
        name: 'Bad source',
        sourceUrl: null,
        credentialId: null,
      },
    });
    await expect(svc.startMcpServer(ID)).rejects.toThrow(/upstream base url/i);
  });
});

describe('SemanticEngineService.updateMcpServerToolsEnabled', () => {
  it('updates tool enabled flags and marks stopped runtime config dirty', async () => {
    const { svc, prisma, deployer } = makeService({
      serverConfig: { k8s: { deployment: SLUG }, toolCount: 2 },
      serverTools: [
        { id: 'tool-1', enabledInMcp: true },
        { id: 'tool-2', enabledInMcp: false },
      ],
    });

    const result = await svc.updateMcpServerToolsEnabled(ID, {
      tools: [{ id: 'tool-1', enabledInMcp: false }],
      apply: true,
    });

    expect(result).toEqual(
      expect.objectContaining({ updated: true, applied: false, enabledToolCount: 1 }),
    );
    expect(prisma.mcpTool.update).toHaveBeenCalledWith({
      where: { id: 'tool-1' },
      data: { enabledInMcp: false },
    });
    expect(prisma.mcpServer.update).toHaveBeenLastCalledWith({
      where: { id: ID },
      data: expect.objectContaining({
        serverConfig: expect.objectContaining({
          toolCount: 1,
          toolsConfigDirty: true,
        }),
      }),
    });
    expect(deployer.deploy).not.toHaveBeenCalled();
  });

  it('rejects tool ids from another MCP server', async () => {
    const { svc } = makeService({ serverTools: [{ id: 'tool-1', enabledInMcp: true }] });
    await expect(
      svc.updateMcpServerToolsEnabled(ID, {
        tools: [{ id: 'other-tool', enabledInMcp: false }],
        apply: true,
      }),
    ).rejects.toThrow(/do not belong/i);
  });
});

describe('SemanticEngineService.stopMcpServer', () => {
  it('throws NotFound when server does not exist', async () => {
    const { svc } = makeService({ serverFound: false });
    await expect(svc.stopMcpServer(ID)).rejects.toThrow(NotFoundException);
  });

  it('updates DB only for legacy server without k8s deployment', async () => {
    const { svc, prisma, deployer } = makeService({
      serverConfig: { baseUrl: 'http://legacy', toolCount: 3, transport: 'http' },
    });
    const result = await svc.stopMcpServer(ID);
    expect(result).toEqual({
      stopped: true,
      note: expect.stringContaining('No Kubernetes deployment'),
    });
    expect(deployer.scale).not.toHaveBeenCalled();
    expect(prisma.mcpServer.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { status: 'stopped' },
    });
  });

  it('converges DB to stopped when deployment is already gone', async () => {
    const { svc, deployer, prisma } = makeService({ exists: false });
    const result = await svc.stopMcpServer(ID);
    expect(result.stopped).toBe(true);
    expect(deployer.scale).not.toHaveBeenCalled();
    expect(prisma.mcpServer.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { status: 'stopped' },
    });
  });

  it('scales to 0 then waits and flips status to stopped on success', async () => {
    const { svc, deployer, prisma } = makeService();
    const result = await svc.stopMcpServer(ID);
    expect(result).toEqual({ stopped: true });
    expect(deployer.scale).toHaveBeenCalledWith({
      slug: SLUG,
      namespace: expect.any(String),
      replicas: 0,
    });
    expect(deployer.waitForScale).toHaveBeenCalledWith(expect.objectContaining({ expected: 0 }));
    expect(prisma.mcpServer.update).toHaveBeenLastCalledWith({
      where: { id: ID },
      data: { status: 'stopped', errorMessage: null },
    });
  });

  it('still records stopped + note when waitForScale lingers', async () => {
    const { svc, prisma } = makeService({
      scaleResult: { ok: false, message: 'pods still terminating' },
    });
    const result = await svc.stopMcpServer(ID);
    expect(result).toEqual({ stopped: true, note: 'pods still terminating' });
    expect(prisma.mcpServer.update).toHaveBeenLastCalledWith({
      where: { id: ID },
      data: { status: 'stopped', errorMessage: null },
    });
  });
});
