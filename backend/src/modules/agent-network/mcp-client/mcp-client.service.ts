import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createMcpClient } from './mcp-client.factory';

interface CacheEntry {
  client: Client;
  lastUsed: number;
}

@Injectable()
export class McpClientService implements OnModuleDestroy {
  private readonly logger = new Logger(McpClientService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 10 * 60 * 1000;
  private sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 60 * 1000);
    this.sweeper.unref?.();
  }

  private key(sessionId: string, mcpServerId: string) {
    return `${sessionId}:${mcpServerId}`;
  }

  async getOrCreate(sessionId: string, mcpServerId: string, endpointUrl: string): Promise<Client> {
    const k = this.key(sessionId, mcpServerId);
    const hit = this.cache.get(k);
    if (hit) {
      hit.lastUsed = Date.now();
      return hit.client;
    }
    const client = await createMcpClient(endpointUrl);
    this.cache.set(k, { client, lastUsed: Date.now() });
    return client;
  }

  async closeSession(sessionId: string): Promise<void> {
    const prefix = `${sessionId}:`;
    for (const [k, entry] of this.cache.entries()) {
      if (k.startsWith(prefix)) {
        await entry.client.close().catch(() => undefined);
        this.cache.delete(k);
      }
    }
  }

  private sweep() {
    const now = Date.now();
    for (const [k, entry] of this.cache.entries()) {
      if (now - entry.lastUsed > this.ttlMs) {
        entry.client.close().catch(() => undefined);
        this.cache.delete(k);
      }
    }
  }

  async onModuleDestroy() {
    clearInterval(this.sweeper);
    for (const entry of this.cache.values()) {
      await entry.client.close().catch(() => undefined);
    }
    this.cache.clear();
  }
}
