import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { buildToolHandler } from '../src/tool-factory.js';
import type { ToolConfig } from '../src/types.js';

const tool: ToolConfig = {
  toolName: 'list_orders',
  description: 'List orders',
  method: 'GET',
  path: '/orders',
  inputSchema: { type: 'object' },
  outputSchema: null,
  parameterMapping: { path: [], query: ['status'], header: [], body: null },
};

test('tool handler performs HTTP call and returns body text', async () => {
  const original = getGlobalDispatcher();
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
  try {
    const pool = mock.get('http://mock:9001');
    pool.intercept({ path: '/orders?status=open', method: 'GET' })
      .reply(200, { items: [1, 2] }, { headers: { 'content-type': 'application/json' } });

    const handler = buildToolHandler('http://mock:9001', tool, {});
    const result = await handler({ status: 'open' });
    const text = (result.content[0] as { text: string }).text;
    assert.equal(JSON.parse(text).items.length, 2);
    assert.equal(result.isError, undefined);
  } finally {
    setGlobalDispatcher(original);
    await mock.close();
  }
});

test('tool handler marks isError on 4xx', async () => {
  const original = getGlobalDispatcher();
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
  try {
    const pool = mock.get('http://mock:9001');
    pool.intercept({ path: '/orders?status=bad', method: 'GET' })
      .reply(400, { error: 'bad' }, { headers: { 'content-type': 'application/json' } });
    const handler = buildToolHandler('http://mock:9001', tool, {});
    const result = await handler({ status: 'bad' });
    assert.equal(result.isError, true);
  } finally {
    setGlobalDispatcher(original);
    await mock.close();
  }
});
