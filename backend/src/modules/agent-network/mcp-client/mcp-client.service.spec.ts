jest.mock('./mcp-client.factory', () => ({
  createMcpClient: jest.fn(async () => ({
    close: jest.fn(async () => undefined),
  })),
}));

import { McpClientService } from './mcp-client.service';
import { createMcpClient } from './mcp-client.factory';

describe('McpClientService', () => {
  let svc: McpClientService;
  beforeEach(() => {
    (createMcpClient as jest.Mock).mockClear();
    svc = new McpClientService();
  });
  afterEach(async () => {
    await svc.onModuleDestroy();
  });

  it('caches clients by sessionId+mcpServerId', async () => {
    await svc.getOrCreate('s1', 'm1', 'http://x/mcp');
    await svc.getOrCreate('s1', 'm1', 'http://x/mcp');
    expect(createMcpClient).toHaveBeenCalledTimes(1);
  });

  it('creates distinct clients per session', async () => {
    await svc.getOrCreate('s1', 'm1', 'http://x/mcp');
    await svc.getOrCreate('s2', 'm1', 'http://x/mcp');
    expect(createMcpClient).toHaveBeenCalledTimes(2);
  });

  it('closeSession closes all clients for that session', async () => {
    await svc.getOrCreate('s1', 'm1', 'http://x/mcp');
    await svc.getOrCreate('s1', 'm2', 'http://y/mcp');
    await svc.closeSession('s1');
    await svc.getOrCreate('s1', 'm1', 'http://x/mcp');
    expect(createMcpClient).toHaveBeenCalledTimes(3);
  });
});
