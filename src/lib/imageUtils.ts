import { getModels } from '@/lib/modelUtils';

/**
 * Convert an image file to a base64 data URL string.
 * Note: This requires a browser environment (FileReader).
 */
export function convertImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert image to base64'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };
    reader.readAsDataURL(file);
  });
}

type AgentModelRef = {
  provider: 'openrouter' | 'openai';
  modelName: string;
};

/**
 * Check if a given agent's selected model supports image inputs.
 */
export function supportsImages(agent: AgentModelRef | null | undefined): boolean {
  if (!agent) return false;

  const models = getModels(agent.provider);
  const selectedModel = models.find(model => model.id === agent.modelName);

  return selectedModel?.inputModalities?.includes('images') || false;
}

