import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent } from '@mastra/core/agent';
import { createReActAgentInstance } from '@modules/agent-network/agents/react.agent';
import { createAnthropicModel, createOpenAIModel, createBedrockModel } from './model-providers';

/**
 * Mastra wrapper for multi-model Agent orchestration.
 *
 * Builds a single ReAct-style Agent that handles task planning + tool
 * execution end-to-end. (The previous Router/Specialist split was removed
 * to simplify the runtime.)
 *
 * Models are resolved via Vercel AI SDK providers (@ai-sdk/*).
 */
@Injectable()
export class MastraClientService {
  constructor(private configService: ConfigService) {}

  /**
   * Resolve a Vercel AI SDK model instance from provider + modelId.
   */
  resolveModel(provider: string, modelId: string): any {
    switch (provider) {
      case 'anthropic':
        return createAnthropicModel(modelId, this.configService.get<string>('ANTHROPIC_API_KEY'));
      case 'openai':
        return createOpenAIModel(modelId, this.configService.get<string>('OPENAI_API_KEY'));
      case 'bedrock':
        return createBedrockModel(
          modelId,
          this.configService.get<string>('AWS_REGION'),
          this.configService.get<string>('AWS_ACCESS_KEY_ID'),
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
        );
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  /**
   * Create a ReAct Agent with the specified model, prompt, and MCP tools.
   */
  createAgent(
    name: string,
    provider: string,
    modelId: string,
    systemPrompt: string,
    mcpTools: Record<string, any> = {},
  ): Agent {
    const model = this.resolveModel(provider, modelId);
    return createReActAgentInstance(name, model, systemPrompt, mcpTools);
  }
}
