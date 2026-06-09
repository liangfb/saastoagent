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

import { Test } from '@nestjs/testing';
import { McpServerDeployer, DeployInputs } from './mcp-server-deployer';
import { K8sService } from './k8s.service';

const k8sMock = {
  applyConfigMap: jest.fn().mockResolvedValue(undefined),
  applySecret: jest.fn().mockResolvedValue(undefined),
  applyService: jest.fn().mockResolvedValue(undefined),
  applyDeployment: jest.fn().mockResolvedValue(undefined),
  waitForDeploymentReady: jest.fn().mockResolvedValue({ ready: true }),
  waitForDeploymentScaled: jest.fn().mockResolvedValue({ ok: true }),
  deploymentExists: jest.fn().mockResolvedValue(true),
  deleteByLabel: jest.fn().mockResolvedValue(undefined),
  scaleDeployment: jest.fn().mockResolvedValue(undefined),
  getPodLogs: jest.fn().mockResolvedValue('log-line-1'),
};

function makeInputs(overrides: Partial<DeployInputs> = {}): DeployInputs {
  return {
    mcpServerId: '11111111-1111-1111-1111-111111111111',
    openapiSourceId: '22222222-2222-2222-2222-222222222222',
    sourceName: 'Sales Order Service',
    serverName: 'sales_mcp',
    upstreamBaseUrl: 'http://mock-erp-sales:9001',
    containerImage: 'ecr/mcp-runtime:tag',
    namespace: 'agentic-mesh',
    tools: [],
    credentialSecret: null,
    ...overrides,
  };
}

describe('McpServerDeployer', () => {
  let deployer: McpServerDeployer;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [McpServerDeployer, { provide: K8sService, useValue: k8sMock }],
    }).compile();
    deployer = mod.get(McpServerDeployer);
  });

  it('applies ConfigMap, Service, Deployment in order and returns endpointUrl', async () => {
    const result = await deployer.deploy(makeInputs());
    expect(k8sMock.applyConfigMap).toHaveBeenCalledTimes(1);
    expect(k8sMock.applyService).toHaveBeenCalledTimes(1);
    expect(k8sMock.applyDeployment).toHaveBeenCalledTimes(1);
    expect(k8sMock.applySecret).not.toHaveBeenCalled();
    expect(result.endpointUrl).toMatch(
      /^http:\/\/mcp-sales-order-service-\w+\.agentic-mesh\.svc\.cluster\.local:8080\/mcp$/,
    );
  });

  it('applies Secret when credentialSecret provided', async () => {
    await deployer.deploy(
      makeInputs({
        credentialSecret: { authType: 'bearer_token', data: { BEARER_TOKEN: 'x' } },
      }),
    );
    expect(k8sMock.applySecret).toHaveBeenCalledTimes(1);
  });

  it('throws when waitForDeploymentReady fails', async () => {
    k8sMock.waitForDeploymentReady.mockResolvedValueOnce({ ready: false, message: 'timeout' });
    await expect(deployer.deploy(makeInputs())).rejects.toThrow('timeout');
  });

  it('destroy calls deleteByLabel with selector containing mcp-server-id', async () => {
    await deployer.destroy({ mcpServerId: 'abc', namespace: 'agentic-mesh' });
    expect(k8sMock.deleteByLabel).toHaveBeenCalledWith(
      'agentic-mesh',
      'agentic-mesh/mcp-server-id=abc',
    );
  });

  it('scale calls scaleDeployment with replicas', async () => {
    await deployer.scale({ slug: 'mcp-x', namespace: 'agentic-mesh', replicas: 0 });
    expect(k8sMock.scaleDeployment).toHaveBeenCalledWith('agentic-mesh', 'mcp-x', 0);
  });

  it('fetchLogs delegates to getPodLogs with label selector', async () => {
    const logs = await deployer.fetchLogs({ mcpServerId: 'abc', namespace: 'agentic-mesh' });
    expect(k8sMock.getPodLogs).toHaveBeenCalledWith(
      'agentic-mesh',
      'agentic-mesh/mcp-server-id=abc',
      expect.any(Number),
    );
    expect(logs).toBe('log-line-1');
  });

  it('deploymentExists delegates to k8s.deploymentExists', async () => {
    k8sMock.deploymentExists.mockResolvedValueOnce(false);
    const exists = await deployer.deploymentExists({
      slug: 'mcp-x',
      namespace: 'agentic-mesh',
    });
    expect(k8sMock.deploymentExists).toHaveBeenCalledWith('agentic-mesh', 'mcp-x');
    expect(exists).toBe(false);
  });

  it('waitForScale delegates to k8s.waitForDeploymentScaled with default timeout', async () => {
    const result = await deployer.waitForScale({
      slug: 'mcp-x',
      namespace: 'agentic-mesh',
      expected: 0,
    });
    expect(k8sMock.waitForDeploymentScaled).toHaveBeenCalledWith(
      'agentic-mesh',
      'mcp-x',
      0,
      90_000,
    );
    expect(result.ok).toBe(true);
  });

  it('waitForScale forwards custom timeout', async () => {
    await deployer.waitForScale({
      slug: 'mcp-x',
      namespace: 'agentic-mesh',
      expected: 1,
      timeoutMs: 30_000,
    });
    expect(k8sMock.waitForDeploymentScaled).toHaveBeenLastCalledWith(
      'agentic-mesh',
      'mcp-x',
      1,
      30_000,
    );
  });
});
