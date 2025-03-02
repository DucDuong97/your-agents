// Define interface for model in the returned array
export interface ModelInfo {
  id: string;
  name: string;
  provider: 'openrouter' | 'openai';
}

// Define interface for OpenRouter model
interface OpenRouterModel {
  id: string;
  name?: string;
  [key: string]: unknown;
}

// Simple message format for API calls
export interface ApiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ApiMessage[];
  model: string;
  apiKey: string;
  provider: 'openrouter' | 'openai';
}

export interface ChatCompletionResponse {
  content: string;
}

// Client-side function to generate chat completion
export async function generateChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
  try {
    const { messages, model, apiKey, provider } = options;

    if (provider === 'openrouter') {
      // Call OpenRouter API
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Next.js Chat Bot',
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      return { content: data.choices[0]?.message?.content || 'No response generated' };
    } else {
      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      return { content: data.choices[0]?.message?.content || 'No response generated' };
    }
  } catch (error) {
    console.error('Error generating chat completion:', error);
    throw new Error('Failed to generate response from AI');
  }
}

// Client-side function to get available OpenRouter models
export async function getOpenRouterModels(apiKey: string): Promise<Array<ModelInfo>> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Next.js Chat Bot',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    const models = data.data.map((model: OpenRouterModel) => ({
      id: model.id,
      name: model.name || model.id,
      provider: 'openrouter' as const,
    }));
    
    // Sort models alphabetically by name
    return models.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    // Fallback models (sorted alphabetically)
    return [
      { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'openrouter' },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', provider: 'openrouter' },
      { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'openrouter' },
      { id: 'google/gemini-pro', name: 'Gemini Pro', provider: 'openrouter' },
      { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openrouter' },
      { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openrouter' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openrouter' },
      { id: 'meta-llama/llama-3-70b-instruct', name: 'Llama 3 70B', provider: 'openrouter' },
    ];
  }
}

// Client-side function to get available OpenAI models
export async function getOpenAIModels(apiKey: string): Promise<Array<ModelInfo>> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      // throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Filter for chat models only
    const chatModels = data.data
      .filter((model: { id: string }) => 
        model.id.includes('gpt') && 
        !model.id.includes('instruct') && 
        !model.id.includes('-vision-') &&
        !model.id.includes('ft-')
      )
      .map((model: { id: string }) => ({
        id: model.id,
        name: getOpenAIModelDisplayName(model.id),
        provider: 'openai' as const,
      }));
    
    // Sort models alphabetically by name
    return chatModels.sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching OpenAI models:', error);
    // Fallback models (sorted alphabetically)
    return [
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
      { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    ];
  }
}

// Helper function to get a display name for OpenAI models
function getOpenAIModelDisplayName(modelId: string): string {
  const displayNames: Record<string, string> = {
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'gpt-4': 'GPT-4',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-4o': 'GPT-4o',
  };
  
  return displayNames[modelId] || modelId;
} 