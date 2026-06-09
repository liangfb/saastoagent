import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

/**
 * Vercel AI SDK model provider factories.
 * Each function creates a model instance that can be passed to Mastra Agent.
 */

export function createAnthropicModel(modelId: string, apiKey?: string) {
  const provider = createAnthropic({ apiKey });
  return provider(modelId);
}

export function createOpenAIModel(modelId: string, apiKey?: string) {
  const provider = createOpenAI({ apiKey });
  return provider(modelId);
}

export function createBedrockModel(
  modelId: string,
  region?: string,
  accessKeyId?: string,
  secretAccessKey?: string,
) {
  const provider = createAmazonBedrock({
    region: region || 'us-east-1',
    accessKeyId,
    secretAccessKey,
  });
  return provider(modelId);
}
