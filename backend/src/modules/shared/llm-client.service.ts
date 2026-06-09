import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText, streamText } from 'ai';
import type { LlmConfig } from '@prisma/client';
import { createAnthropicModel, createOpenAIModel, createBedrockModel } from './model-providers';

/**
 * Vercel AI SDK wrapper for multi-provider LLM calls.
 * Used for non-Agent scenarios: semantic enhancement, intent classification, etc.
 * Supports multiple providers via the same @ai-sdk/* packages used by Mastra.
 */
@Injectable()
export class LlmClientService {
  constructor(private configService: ConfigService) {}

  private resolveModel(provider: string, modelId: string) {
    switch (provider) {
      case 'anthropic':
        return createAnthropicModel(modelId, this.configService.get('ANTHROPIC_API_KEY'));
      case 'openai':
        return createOpenAIModel(modelId, this.configService.get('OPENAI_API_KEY'));
      case 'bedrock':
        return createBedrockModel(
          modelId,
          this.configService.get('AWS_REGION'),
          this.configService.get('AWS_ACCESS_KEY_ID'),
          this.configService.get('AWS_SECRET_ACCESS_KEY'),
        );
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  /**
   * Generate text using the specified provider and model.
   * Used for semantic enhancement (FR-1.2), intent classification, etc.
   */
  async generate(provider: string, modelId: string, prompt: string, systemPrompt?: string) {
    const model = this.resolveModel(provider, modelId);
    return generateText({
      model,
      system: systemPrompt,
      prompt,
    });
  }

  /**
   * Stream text using the specified provider and model.
   * Returns an async iterable of text chunks for SSE output.
   */
  async stream(provider: string, modelId: string, prompt: string, systemPrompt?: string) {
    const model = this.resolveModel(provider, modelId);
    return streamText({
      model,
      system: systemPrompt,
      prompt,
    });
  }

  /**
   * Resolve a model using credentials from an LlmConfig record (not env vars).
   * Used by BullMQ processors that look up a LlmConfig via UsageType assignment.
   */
  resolveModelFromConfig(config: LlmConfig) {
    const creds = (config.credentials as Record<string, string>) ?? {};
    switch (config.provider) {
      case 'anthropic':
        return createAnthropicModel(
          config.modelId,
          creds.apiKey || this.configService.get('ANTHROPIC_API_KEY'),
        );
      case 'openai':
        return createOpenAIModel(
          config.modelId,
          creds.apiKey || this.configService.get('OPENAI_API_KEY'),
        );
      case 'bedrock':
        return createBedrockModel(
          config.modelId,
          config.region || creds.region || this.configService.get('AWS_REGION'),
          creds.accessKeyId || this.configService.get('AWS_ACCESS_KEY_ID'),
          creds.secretAccessKey || this.configService.get('AWS_SECRET_ACCESS_KEY'),
        );
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  async generateWithConfig(config: LlmConfig, prompt: string, systemPrompt?: string) {
    const model = this.resolveModelFromConfig(config);
    return generateText({ model, system: systemPrompt, prompt });
  }
}
