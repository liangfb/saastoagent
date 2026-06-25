// --- Unified API response wrapper ---
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// --- Enums (mirror backend Prisma enums) ---
export type AuthType = 'api_key' | 'oauth2' | 'bearer_token';
export type SourceType = 'url' | 'file' | 'manual';
export type ParseStatus = 'pending' | 'parsing' | 'parsed' | 'failed';
export type AgentType = 'router' | 'specialist';
export type McpServerStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'running' | 'stopped';
export type AsyncTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AsyncTaskType = 'openapi_parse' | 'semantic_enhance' | 'mcp_generate';
export type SessionStatus = 'active' | 'closed';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type LlmProvider = 'openai' | 'anthropic' | 'google' | 'bedrock';
export type UsageType = 'semantic_enhancement' | 'agent_reasoning' | 'intent_classification';

// --- Entity interfaces ---
export interface Credential {
  id: string;
  name: string;
  authType: AuthType;
  config: Record<string, unknown>;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpenapiSource {
  id: string;
  name: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  baseUrl: string | null;
  specVersion: string | null;
  businessDescription: string | null;
  credentialId: string | null;
  parseStatus: ParseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Endpoint {
  id: string;
  openapiSourceId: string;
  path: string;
  httpMethod: string;
  operationId: string | null;
  summary: string | null;
  originalDescription: string | null;
  requiresManualReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  agentType: AgentType;
  description: string | null;
  systemPrompt: string | null;
  llmConfigId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface McpServer {
  id: string;
  openapiSourceId: string;
  name: string;
  status: McpServerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LlmConfig {
  id: string;
  provider: LlmProvider;
  name: string;
  apiEndpoint: string | null;
  region: string | null;
  modelId: string;
  defaultParams: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LlmModelAssignment {
  id: string;
  usageType: UsageType;
  llmConfigId: string;
  fallbackLlmConfigId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  title: string | null;
  agentId: string | null;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AsyncTask {
  id: string;
  taskType: AsyncTaskType;
  referenceId: string | null;
  status: AsyncTaskStatus;
  progress: number;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Trace {
  id: string;
  name: string;
  sessionId: string | null;
  status: string;
  duration: number | null;
  createdAt: string;
  langfuseUrl: string | null;
}

export interface LogEntry {
  id: string;
  level: string;
  service: string;
  message: string;
  action?: string;
  resourceType?: string | null;
  resourceId?: string | null;
  userId?: string | null;
  traceId: string | null;
  status?: string | null;
  toolName?: string | null;
  details?: Record<string, unknown> | null;
  timestamp: string;
}
