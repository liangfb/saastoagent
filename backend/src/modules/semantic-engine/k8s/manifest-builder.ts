import type { V1ConfigMap, V1Deployment, V1Secret, V1Service } from '@kubernetes/client-node';
import { createHash } from 'crypto';
import { mcpServerLabels } from './labels';

export interface ToolManifest {
  toolName: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  parameterMapping: {
    path: string[];
    query: string[];
    header: string[];
    body: string | null;
  };
}

export interface CredentialSecretData {
  authType: 'api_key' | 'bearer_token' | 'oauth2';
  data: Record<string, string>;
}

export interface ManifestInputs {
  slug: string;
  namespace: string;
  mcpServerId: string;
  openapiSourceId: string;
  upstreamBaseUrl: string;
  containerImage: string;
  serverName: string;
  tools: ToolManifest[];
  credentialSecret: CredentialSecretData | null;
}

const CONFIG_MOUNT_PATH = '/etc/mcp';
const CONTAINER_PORT = 8080;

function runtimeConfig(inp: ManifestInputs) {
  return {
    serverId: inp.mcpServerId,
    serverName: inp.serverName,
    upstreamBaseUrl: inp.upstreamBaseUrl,
    tools: inp.tools,
  };
}

function configHash(inp: ManifestInputs) {
  return createHash('sha256')
    .update(JSON.stringify(runtimeConfig(inp)))
    .digest('hex')
    .slice(0, 16);
}

function labels(inp: ManifestInputs) {
  return mcpServerLabels({
    mcpServerId: inp.mcpServerId,
    openapiSourceId: inp.openapiSourceId,
  });
}

export function buildConfigMap(inp: ManifestInputs): V1ConfigMap {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: inp.slug,
      namespace: inp.namespace,
      labels: labels(inp),
    },
    data: {
      'config.json': JSON.stringify(runtimeConfig(inp), null, 2),
    },
  };
}

export function buildSecret(inp: ManifestInputs): V1Secret | undefined {
  if (!inp.credentialSecret) return undefined;
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    type: 'Opaque',
    metadata: {
      name: `${inp.slug}-cred`,
      namespace: inp.namespace,
      labels: labels(inp),
    },
    stringData: inp.credentialSecret.data,
  };
}

export function buildService(inp: ManifestInputs): V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: inp.slug,
      namespace: inp.namespace,
      labels: labels(inp),
    },
    spec: {
      type: 'ClusterIP',
      selector: {
        'agentic-mesh/mcp-server-id': inp.mcpServerId,
      },
      ports: [
        {
          port: CONTAINER_PORT,
          targetPort: CONTAINER_PORT,
          protocol: 'TCP',
          name: 'http',
        },
      ],
    },
  };
}

export function buildDeployment(inp: ManifestInputs): V1Deployment {
  const envFrom = inp.credentialSecret ? [{ secretRef: { name: `${inp.slug}-cred` } }] : undefined;

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: inp.slug,
      namespace: inp.namespace,
      labels: labels(inp),
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'agentic-mesh/mcp-server-id': inp.mcpServerId,
        },
      },
      template: {
        metadata: {
          labels: labels(inp),
          annotations: {
            'agentic-mesh/config-hash': configHash(inp),
          },
        },
        spec: {
          serviceAccountName: 'default',
          containers: [
            {
              name: 'mcp-runtime',
              image: inp.containerImage,
              imagePullPolicy: 'IfNotPresent',
              ports: [{ containerPort: CONTAINER_PORT, name: 'http' }],
              env: [
                { name: 'MCP_CONFIG_PATH', value: `${CONFIG_MOUNT_PATH}/config.json` },
                { name: 'PORT', value: String(CONTAINER_PORT) },
              ],
              envFrom,
              volumeMounts: [{ name: 'mcp-config', mountPath: CONFIG_MOUNT_PATH, readOnly: true }],
              readinessProbe: {
                httpGet: { path: '/readyz', port: CONTAINER_PORT },
                periodSeconds: 5,
                failureThreshold: 3,
              },
              livenessProbe: {
                httpGet: { path: '/healthz', port: CONTAINER_PORT },
                periodSeconds: 15,
                failureThreshold: 3,
              },
              resources: {
                requests: { cpu: '50m', memory: '64Mi' },
                limits: { cpu: '500m', memory: '256Mi' },
              },
            },
          ],
          volumes: [{ name: 'mcp-config', configMap: { name: inp.slug } }],
        },
      },
    },
  };
}
