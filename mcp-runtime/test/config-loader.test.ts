import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config-loader.ts';

test('loadConfig reads JSON file and returns parsed config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-cfg-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, JSON.stringify({
    serverId: '00000000-0000-0000-0000-000000000001',
    serverName: 'sales_mcp',
    upstreamBaseUrl: 'http://mock:9001',
    tools: [],
  }));
  try {
    const cfg = loadConfig(file);
    assert.equal(cfg.serverName, 'sales_mcp');
    assert.equal(cfg.upstreamBaseUrl, 'http://mock:9001');
    assert.deepEqual(cfg.tools, []);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('loadConfig throws on invalid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-cfg-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, 'not-json');
  try {
    assert.throws(() => loadConfig(file), /config/i);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
