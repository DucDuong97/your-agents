import { ModelInfo } from './openrouter-client';
import modelData from '@/assets/modelData.json';

/**
 * Get models for a specific provider
 * @param provider The provider to get models for ('openrouter' or 'openai')
 * @returns An array of ModelInfo objects
 */
export function getModels(provider: 'openrouter' | 'openai'): ModelInfo[] {
  return modelData[provider] as ModelInfo[];
}

/**
 * Get all available models
 * @returns An array of all ModelInfo objects
 */
export function getAllModels(): ModelInfo[] {
  return [...modelData.openrouter, ...modelData.openai] as ModelInfo[];
}

/**
 * Get a model by its ID
 * @param modelId The ID of the model to get
 * @returns The ModelInfo object for the model, or undefined if not found
 */
export function getModelById(modelId: string): ModelInfo | undefined {
  return getAllModels().find(model => model.id === modelId);
} 