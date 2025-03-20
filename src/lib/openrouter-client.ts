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
  onUpdate?: (content: string) => void;
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
    const { messages, model, apiKey, provider, onUpdate } = options;

    // Check if the model is an Anthropic Claude model or other models that use max_completion_tokens
    const usesMaxCompletionTokens = 
      model.includes('claude') || 
      model.includes('o3-') ||
      model.includes('o1-');
    
    // Prepare the request body based on the model type
    const requestBody = {
      model: model,
      messages: messages,
      stream: true,
      ...(usesMaxCompletionTokens 
        ? { max_completion_tokens: 1000 } 
        : { temperature: 0.7, max_tokens: 1000 })
    };

    if (provider === 'openrouter') {
      // Call OpenRouter API with streaming
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

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let completeContent = '';
      let totalTokens = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode the chunk and split into lines
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(5));
                if (data.choices?.[0]?.delta?.content) {
                  const newContent = data.choices[0].delta.content;
                  completeContent += newContent;
                  onUpdate?.(completeContent);
                }
                // Update token counts if available
                if (data.usage) {
                  totalTokens = data.usage;
                }
              } catch (e) {
                console.warn('Error parsing streaming response:', e);
              }
            }
          }
        }
      }

      return { 
        content: completeContent || 'No response generated',
        usage: totalTokens
      };
    } else {
      // Call OpenAI API with streaming
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

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let completeContent = '';
      let totalTokens = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode the chunk and split into lines
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(5));
                if (data.choices?.[0]?.delta?.content) {
                  const newContent = data.choices[0].delta.content;
                  completeContent += newContent;
                  onUpdate?.(completeContent);
                }
                // Update token counts if available
                if (data.usage) {
                  totalTokens = data.usage;
                }
              } catch (e) {
                console.warn('Error parsing streaming response:', e);
              }
            }
          }
        }
      }

      return { 
        content: completeContent || 'No response generated',
        usage: totalTokens
      };
    }
  } catch (error) {
    console.error('Error generating chat completion:', error);
    throw new Error('Failed to generate response from AI');
  }
} 