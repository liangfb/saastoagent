import {
  buildConfigMap,
  buildSecret,
  buildDeployment,
  buildService,
  ManifestInputs,
} from './manifest-builder';

const base: ManifestInputs = {
  slug: 'mcp-sales-abc123',
  namespace: 'agentic-mesh',
  mcpServerId: '11111111-1111-1111-1111-111111111111',
  openapiSourceId: '22222222-2222-2222-2222-222222222222',
  upstreamBaseUrl: 'http://mock-erp-sales:9001',
  containerImage:
    '000000000000.dkr.ecr.us-west-2.amazonaws.com/agentic-mesh-dev-mcp-runtime:latest',
  serverName: 'sales_mcp',
  tools: [],
  credentialSecret: null,
};

describe('ManifestBuilder', () => {
  it('builds ConfigMap with data.config.json containing runtime config', () => {
    const cm = buildConfigMap(base);
    expect(cm.kind).toBe('ConfigMap');
    expect(cm.metadata?.name).toBe('mcp-sales-abc123');
    expect(cm.metadata?.labels?.['agentic-mesh/mcp-server-id']).toBe(base.mcpServerId);
    const parsed = JSON.parse(cm.data!['config.json']);
    expect(parsed.serverName).toBe('sales_mcp');
    expect(parsed.upstreamBaseUrl).toBe(base.upstreamBaseUrl);
  });

  it('buildSecret returns undefined when credentialSecret is null', () => {
    expect(buildSecret(base)).toBeUndefined();
  });

  it('builds Secret with api_key fields', () => {
    const out = buildSecret({
      ...base,
      credentialSecret: {
        authType: 'api_key',
        data: { API_KEY_NAME: 'X-Key', API_KEY_VALUE: 'v', API_KEY_LOCATION: 'header' },
      },
    });
    expect(out?.kind).toBe('Secret');
    expect(out?.stringData?.API_KEY_VALUE).toBe('v');
  });

  it('builds Service as ClusterIP on port 8080', () => {
    const svc = buildService(base);
    expect(svc.spec?.type).toBe('ClusterIP');
    expect(svc.spec?.ports?.[0].port).toBe(8080);
    expect(svc.spec?.selector?.['agentic-mesh/mcp-server-id']).toBe(base.mcpServerId);
  });

  it('builds Deployment with configmap mount and secret envFrom when secret present', () => {
    const dep = buildDeployment({
      ...base,
      credentialSecret: { authType: 'bearer_token', data: { BEARER_TOKEN: 'tok' } },
    });
    const c = dep.spec!.template.spec!.containers[0];
    expect(c.image).toBe(base.containerImage);
    const volMount = c.volumeMounts?.find((v) => v.name === 'mcp-config');
    expect(volMount?.mountPath).toBe('/etc/mcp');
    const envFrom = c.envFrom?.find((e) => e.secretRef?.name === `${base.slug}-cred`);
    expect(envFrom).toBeTruthy();
  });

  it('builds Deployment without secret envFrom when no credentials', () => {
    const dep = buildDeployment(base);
    const c = dep.spec!.template.spec!.containers[0];
    expect((c.envFrom ?? []).some((e) => e.secretRef)).toBe(false);
  });

  it('adds a config hash annotation to trigger rollout when tools change', () => {
    const depA = buildDeployment({
      ...base,
      tools: [
        {
          toolName: 'list_accounts',
          description: 'List accounts',
          method: 'GET',
          path: '/accounts',
          inputSchema: { type: 'object', properties: {} },
          outputSchema: null,
          parameterMapping: { path: [], query: [], header: [], body: null },
        },
      ],
    });
    const depB = buildDeployment({
      ...base,
      tools: [
        {
          toolName: 'list_payments',
          description: 'List payments',
          method: 'GET',
          path: '/payments',
          inputSchema: { type: 'object', properties: {} },
          outputSchema: null,
          parameterMapping: { path: [], query: [], header: [], body: null },
        },
      ],
    });

    const hashA = depA.spec?.template.metadata?.annotations?.['agentic-mesh/config-hash'];
    const hashB = depB.spec?.template.metadata?.annotations?.['agentic-mesh/config-hash'];
    expect(hashA).toMatch(/^[a-f0-9]{16}$/);
    expect(hashB).toMatch(/^[a-f0-9]{16}$/);
    expect(hashA).not.toBe(hashB);
  });
});
