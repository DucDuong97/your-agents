import type { ApiMessage, ChatCompletionResponse, ContentItem } from '@/lib/openrouter';
import { getModelById } from '@/lib/modelUtils';

export interface MessagePrice {
  promptTokens?: number;
  completionTokens?: number;
  imageCount?: number;
  totalCost?: number;
  promptCost?: number;
  completionCost?: number;
  imageCost?: number;
}

function extractTextFromContent(content: ApiMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as ContentItem[])
    .filter(item => item.type === 'text')
    .map(item => item.text ?? '')
    .join(' ');
}

function countImagesInContent(content: ApiMessage['content']): number {
  if (!Array.isArray(content)) return 0;
  return (content as ContentItem[]).filter(item => item.type === 'image_url').length;
}

function estimateTokensFromText(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.max(0, Math.ceil(text.length / 4));
}

function hasNonZeroUsage(response: ChatCompletionResponse): boolean {
  const u = response.usage;
  if (!u) return false;
  return (u.total_tokens ?? 0) > 0 || (u.prompt_tokens ?? 0) > 0 || (u.completion_tokens ?? 0) > 0;
}

export function calculateChatCompletionPrice(params: {
  apiMessages: ApiMessage[];
  response: ChatCompletionResponse;
  modelId: string;
}): MessagePrice {
  const { apiMessages, response, modelId } = params;

  const modelInfo = getModelById(modelId);
  const pricing = modelInfo?.pricing || { prompt: 0, completion: 0, image: 0 };

  const promptText = apiMessages.map(msg => extractTextFromContent(msg.content)).join(' ');
  const completionText = response.content ?? '';

  const promptTokens = hasNonZeroUsage(response)
    ? response.usage!.prompt_tokens
    : estimateTokensFromText(promptText);

  const completionTokens = hasNonZeroUsage(response)
    ? response.usage!.completion_tokens
    : estimateTokensFromText(completionText);

  const imageCount = apiMessages.reduce((count, msg) => count + countImagesInContent(msg.content), 0);

  // Costs in USD:
  // - prompt/completion pricing is per 1M tokens (as stored in modelData)
  // - image pricing is per image
  const promptCost = (promptTokens / 1_000_000) * (pricing.prompt || 0);
  const completionCost = (completionTokens / 1_000_000) * (pricing.completion || 0);
  const imageCost = imageCount * (pricing.image || 0);
  const totalCost = promptCost + completionCost + imageCost;

  return {
    promptTokens,
    completionTokens,
    imageCount,
    totalCost,
    promptCost,
    completionCost,
    imageCost,
  };
}


