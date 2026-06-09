import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Langfuse } from 'langfuse';

export interface TraceStart {
  id?: string;
  name: string;
  userId?: string;
  sessionId?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface GenerationStart {
  name: string;
  model?: string;
  modelParameters?: Record<string, unknown>;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

export interface SpanStart {
  name: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Langfuse integration (Langfuse Cloud or self-hosted).
 *
 * Wraps the Langfuse JS SDK for Agent trace recording.
 * When LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are configured (with an
 * optional LANGFUSE_BASE_URL — defaults to Langfuse Cloud), events are sent
 * to Langfuse; otherwise falls back to noop so dev environments still work.
 */
@Injectable()
export class LangfuseService implements OnModuleDestroy {
  private readonly logger = new Logger(LangfuseService.name);
  private readonly client: Langfuse | null;

  /** Resolve the Langfuse base URL: LANGFUSE_BASE_URL preferred, LANGFUSE_HOST fallback. */
  private baseUrl(): string | undefined {
    return (
      this.config.get<string>('LANGFUSE_BASE_URL') ??
      this.config.get<string>('LANGFUSE_HOST')
    );
  }

  constructor(private readonly config: ConfigService) {
    const publicKey = config.get<string>('LANGFUSE_PUBLIC_KEY');
    const secretKey = config.get<string>('LANGFUSE_SECRET_KEY');
    const baseUrl = this.baseUrl();
    if (publicKey && secretKey) {
      this.client = new Langfuse({ publicKey, secretKey, baseUrl });
      this.logger.log(`Langfuse enabled (baseUrl=${baseUrl ?? 'cloud default'})`);
    } else {
      this.client = null;
      this.logger.log('Langfuse disabled (missing credentials) — using noop tracer');
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  startTrace(input: TraceStart) {
    if (!this.client) return this.noopTrace();
    return this.client.trace({
      id: input.id,
      name: input.name,
      userId: input.userId,
      sessionId: input.sessionId,
      input: input.input,
      metadata: input.metadata,
      tags: input.tags,
    });
  }

  async flush(): Promise<void> {
    if (this.client) {
      try {
        await this.client.flushAsync();
      } catch (err) {
        this.logger.warn(`Langfuse flush failed: ${(err as Error).message}`);
      }
    }
  }

  async onModuleDestroy() {
    await this.flush();
    await this.client?.shutdownAsync().catch(() => undefined);
  }

  private noopTrace() {
    const noop = () => noopWrap;
    const noopWrap: any = {
      id: undefined,
      update: noop,
      end: noop,
      generation: () => noopWrap,
      span: () => noopWrap,
      event: () => noopWrap,
      score: () => noopWrap,
    };
    return noopWrap;
  }

  // ============================================================
  // HTTP-level Trace querying (used by Observability controller)
  // ============================================================

  async listTraces(params: { page?: number; pageSize?: number } = {}) {
    if (!this.client) return { items: [], total: 0 };
    const host = this.baseUrl();
    const publicKey = this.config.get<string>('LANGFUSE_PUBLIC_KEY');
    const secretKey = this.config.get<string>('LANGFUSE_SECRET_KEY');
    if (!host || !publicKey || !secretKey) return { items: [], total: 0 };
    const url = new URL('/api/public/traces', host);
    if (params.page) url.searchParams.set('page', String(params.page));
    if (params.pageSize) url.searchParams.set('limit', String(params.pageSize));
    try {
      const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) return { items: [], total: 0 };
      const payload = (await res.json()) as any;
      const base = host.replace(/\/$/, '');
      // Each trace carries an htmlPath (/project/<id>/traces/<id>) from Langfuse;
      // join it to the base URL so the UI can deep-link straight to the trace.
      const items = ((payload.data ?? []) as Record<string, unknown>[]).map(
        (t) => ({
          ...t,
          langfuseUrl:
            typeof t.htmlPath === 'string' ? `${base}${t.htmlPath}` : null,
        }),
      );
      return {
        items,
        total: payload.meta?.totalItems ?? payload.meta?.total ?? 0,
      };
    } catch (err) {
      this.logger.warn(`Langfuse list traces failed: ${(err as Error).message}`);
      return { items: [], total: 0 };
    }
  }

  async getTrace(id: string): Promise<unknown | null> {
    const host = this.baseUrl();
    const publicKey = this.config.get<string>('LANGFUSE_PUBLIC_KEY');
    const secretKey = this.config.get<string>('LANGFUSE_SECRET_KEY');
    if (!host || !publicKey || !secretKey) return null;
    try {
      const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
      const res = await fetch(`${host}/api/public/traces/${id}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      this.logger.warn(`Langfuse get trace failed: ${(err as Error).message}`);
      return null;
    }
  }
}
