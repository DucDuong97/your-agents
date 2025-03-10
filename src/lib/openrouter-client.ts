// Define interface for model in the returned array
export interface ModelInfo {
  id: string;
  name: string;
  provider: 'openrouter' | 'openai';
  contextLength?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
    image?: number;
  };
  description?: string;
  speed?: 'Very Fast' | 'Fast' | 'Medium' | 'Slow';
  inputModalities?: string[];
  outputModalities?: string[];
  knowledgeCutoff?: string;
}

// Content item for structured messages (text, images, etc.)
export interface ContentItem {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

// Message format for API calls
export interface ApiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentItem[];
}

export interface ChatCompletionOptions {
  messages: ApiMessage[];
  model: string;
  apiKey: string;
  provider: 'openrouter' | 'openai';
}

export interface ChatCompletionResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Client-side function to generate chat completion
export async function generateChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
  try {
    const { messages, model, apiKey, provider } = options;

    // Check if the model is an Anthropic Claude model or other models that use max_completion_tokens
    const usesMaxCompletionTokens = 
      model.includes('claude') || 
      model.includes('o3-') ||
      model.includes('o1-');
    
    // Prepare the request body based on the model type
    const requestBody = {
      model: model,
      messages: messages,
      ...(usesMaxCompletionTokens 
        ? { max_completion_tokens: 1000 } 
        : { temperature: 0.7,max_tokens: 1000 })
    };

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
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      return { 
        content: data.choices[0]?.message?.content || 'No response generated',
        usage: data.usage
      };
    } else {
      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      return { 
        content: data.choices[0]?.message?.content || 'No response generated',
        usage: data.usage
      };
    }
  } catch (error) {
    console.error('Error generating chat completion:', error);
    throw new Error('Failed to generate response from AI');
  }
} 