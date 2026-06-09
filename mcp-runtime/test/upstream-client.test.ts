import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest } from '../src/upstream-client.ts';
import type { ToolConfig } from '../src/types.ts';

const base = 'http://mock:9001';
const tool = (path: string, mapping: ToolConfig['parameterMapping'], method: ToolConfig['method'] = 'GET'): ToolConfig => ({
  toolName: 't',
  description: '',
  method,
  path,
  inputSchema: {},
  outputSchema: null,
  parameterMapping: mapping,
});

test('substitutes path parameters', () => {
  const t = tool('/orders/{id}', { path: ['id'], query: [], header: [], body: null });
  const req = buildRequest(base, t, { id: '123' });
  assert.equal(req.url.toString(), 'http://mock:9001/orders/123');
});

test('appends query parameters', () => {
  const t = tool('/orders', { path: [], query: ['status', 'limit'], header: [], body: null });
  const req = buildRequest(base, t, { status: 'open', limit: 10 });
  assert.equal(req.url.toString(), 'http://mock:9001/orders?status=open&limit=10');
});

test('copies header parameters', () => {
  const t = tool('/x', { path: [], query: [], header: ['X-Corr'], body: null });
  const req = buildRequest(base, t, { 'X-Corr': 'abc' });
  assert.equal(req.headers['X-Corr'], 'abc');
});

test('builds JSON body from body key mapping', () => {
  const t = tool('/orders', { path: [], query: [], header: [], body: 'body' }, 'POST');
  const req = buildRequest(base, t, { body: { amount: 10 } });
  assert.equal(req.method, 'POST');
  assert.equal(req.headers['Content-Type'], 'application/json');
  assert.equal(req.body, JSON.stringify({ amount: 10 }));
});

test('omits body on GET even when mapping says otherwise', () => {
  const t = tool('/x', { path: [], query: [], header: [], body: 'body' }, 'GET');
  const req = buildRequest(base, t, { body: { a: 1 } });
  assert.equal(req.body, undefined);
});
