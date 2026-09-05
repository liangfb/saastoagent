import { McpToolRegistrar, RegistrarToolDef } from './mcp-tool-registrar';

describe('McpToolRegistrar', () => {
  const def: RegistrarToolDef = {
    mcpServerId: 'm1',
    mcpToolId: 't1',
    toolName: 'list_orders',
    description: 'List orders',
    inputSchema: { type: 'object', properties: { status: { type: 'string' } } },
  };

  it('creates a Mastra tool that forwards to mcpClient.callTool', async () => {
    const fakeClient = {
      callTool: jest.fn(async () => ({ content: [{ type: 'text', text: '{"ok":1}' }] })),
    } as any;
    const registrar = new McpToolRegistrar();
    const tool = registrar.toMastraTool(fakeClient, def);
    const result = await (tool as any).execute({ context: { status: 'open' } });
    expect(fakeClient.callTool).toHaveBeenCalledWith({
      name: 'list_orders',
      arguments: { status: 'open' },
    });
    expect(result.content[0].text).toBe('{"ok":1}');
  });

  it('invokes onBefore and onSuccess hooks on successful tool call', async () => {
    const fakeClient = {
      callTool: jest.fn(async () => ({ content: [] })),
    } as any;
    const hooks = {
      onBefore: jest.fn(),
      onSuccess: jest.fn(),
      onError: jest.fn(),
    };
    const tool = new McpToolRegistrar().toMastraTool(fakeClient, def, hooks);
    await (tool as any).execute({ context: { status: 'open' } });
    expect(hooks.onBefore).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'list_orders', args: { status: 'open' } }),
    );
    expect(hooks.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'list_orders',
        durationMs: expect.any(Number),
      }),
    );
    expect(hooks.onError).not.toHaveBeenCalled();
  });

  it('invokes onError hook and rethrows when MCP client throws', async () => {
    const err = new Error('upstream down');
    const fakeClient = {
      callTool: jest.fn(async () => {
        throw err;
      }),
    } as any;
    const hooks = {
      onBefore: jest.fn(),
      onSuccess: jest.fn(),
      onError: jest.fn(),
    };
    const tool = new McpToolRegistrar().toMastraTool(fakeClient, def, hooks);
    await expect((tool as any).execute({ context: {} })).rejects.toThrow('upstream down');
    expect(hooks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'list_orders', error: err }),
    );
    expect(hooks.onSuccess).not.toHaveBeenCalled();
  });

  it('rethrows when onBefore rejects (execution context guard)', async () => {
    const fakeClient = { callTool: jest.fn() } as any;
    const hooks = {
      onBefore: jest.fn(async () => {
        throw new Error('quota exceeded');
      }),
    };
    const tool = new McpToolRegistrar().toMastraTool(fakeClient, def, hooks);
    await expect((tool as any).execute({ context: {} })).rejects.toThrow('quota exceeded');
    expect(fakeClient.callTool).not.toHaveBeenCalled();
  });

  it('does not return an MCP result when the post-tool hook rejects', async () => {
    const fakeClient = {
      callTool: jest.fn(async () => ({ content: [{ type: 'text', text: 'restricted' }] })),
    } as any;
    const hooks = {
      onSuccess: jest.fn(async () => {
        throw new Error('output denied by policy');
      }),
      onError: jest.fn(),
    };
    const tool = new McpToolRegistrar().toMastraTool(fakeClient, def, hooks);

    await expect((tool as any).execute({ context: {} })).rejects.toThrow('output denied by policy');
    expect(fakeClient.callTool).toHaveBeenCalledTimes(1);
    expect(hooks.onError).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'list_orders' }),
    );
  });

  it('derives a typed input schema from the tool JSON Schema (not a free-form record)', () => {
    const strictDef: RegistrarToolDef = {
      mcpServerId: 'm1',
      mcpToolId: 't2',
      toolName: 'create_order',
      description: 'Create an order',
      inputSchema: {
        type: 'object',
        properties: { quantity: { type: 'integer' }, sku: { type: 'string' } },
        required: ['quantity', 'sku'],
      },
    };
    const tool: any = new McpToolRegistrar().toMastraTool({} as any, strictDef);
    // Mastra enforces this schema on the model's args before execute() runs.
    expect(tool.inputSchema.safeParse({ quantity: 2, sku: 'ABC' }).success).toBe(true);
    expect(tool.inputSchema.safeParse({ quantity: 'two' }).success).toBe(false); // wrong type + missing sku
  });
});
