import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function createMcpClient(endpointUrl: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(endpointUrl));
  const client = new Client(
    { name: 'agentic-service-mesh', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}
