import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface Mem0Memory {
  id: string;
  memory: string;
  metadata?: Record<string, unknown>;
  score?: number;
  created_at?: string;
  updated_at?: string;
}

export interface StoreMemoryDto {
  messages: Array<{ role: string; content: string }>;
  userId: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchMemoryDto {
  query: string;
  userId: string;
  agentId?: string;
  runId?: string;
  limit?: number;
}

/**
 * Agent Memory Service — mem0 integration
 *
 * Wraps mem0 self-hosted REST API to provide multi-level memory
 * for agents: user-level, agent-level, and session-level (run_id).
 *
 * mem0 handles memory extraction, deduplication, and vector search
 * via the OpenSearch backend automatically.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly baseUrl: string;

  constructor(private readonly http: HttpService) {
    this.baseUrl = process.env.MEM0_BASE_URL || 'http://localhost:8080';
  }

  /**
   * Store conversation memories in mem0.
   * mem0 automatically extracts key information, deduplicates,
   * and merges with existing memories.
   */
  async store(dto: StoreMemoryDto): Promise<Mem0Memory[]> {
    const { data } = await firstValueFrom(
      this.http.post<{ results: Mem0Memory[] }>(`${this.baseUrl}/api/v1/memories/`, {
        messages: dto.messages,
        user_id: dto.userId,
        agent_id: dto.agentId,
        run_id: dto.runId,
        metadata: dto.metadata,
      }),
    );
    this.logger.debug(`Stored ${data.results?.length ?? 0} memories for user=${dto.userId}`);
    return data.results ?? [];
  }

  /**
   * Semantic search for relevant memories.
   * Returns memories ranked by relevance to the query.
   */
  async search(dto: SearchMemoryDto): Promise<Mem0Memory[]> {
    const { data } = await firstValueFrom(
      this.http.post<{ results: Mem0Memory[] }>(`${this.baseUrl}/api/v1/memories/search/`, {
        query: dto.query,
        user_id: dto.userId,
        agent_id: dto.agentId,
        run_id: dto.runId,
        limit: dto.limit ?? 20,
      }),
    );
    return data.results ?? [];
  }

  /**
   * Get all memories for a user/agent combination.
   */
  async getAll(userId: string, agentId?: string): Promise<Mem0Memory[]> {
    const params: Record<string, string> = { user_id: userId };
    if (agentId) params.agent_id = agentId;

    const { data } = await firstValueFrom(
      this.http.get<{ results: Mem0Memory[] }>(`${this.baseUrl}/api/v1/memories/`, { params }),
    );
    return data.results ?? [];
  }

  /**
   * Get a specific memory by ID.
   */
  async getById(memoryId: string): Promise<Mem0Memory | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<Mem0Memory>(`${this.baseUrl}/api/v1/memories/${memoryId}/`),
      );
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Delete a specific memory by ID.
   */
  async delete(memoryId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.baseUrl}/api/v1/memories/${memoryId}/`));
    this.logger.debug(`Deleted memory ${memoryId}`);
  }

  /**
   * Delete all memories for a user/agent.
   * Useful for session cleanup or user data deletion.
   */
  async deleteAll(userId: string, agentId?: string): Promise<void> {
    const params: Record<string, string> = { user_id: userId };
    if (agentId) params.agent_id = agentId;

    await firstValueFrom(this.http.delete(`${this.baseUrl}/api/v1/memories/`, { params }));
    this.logger.debug(`Deleted all memories for user=${userId} agent=${agentId ?? 'all'}`);
  }

  /**
   * Get modification history for a specific memory.
   */
  async history(memoryId: string): Promise<unknown[]> {
    const { data } = await firstValueFrom(
      this.http.get<unknown[]>(`${this.baseUrl}/api/v1/memories/${memoryId}/history/`),
    );
    return data ?? [];
  }
}
