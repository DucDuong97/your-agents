import { Message } from "./db";

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
  title?: string;
  messages: ApiMessage[];
  model: string;
  apiKey: string;
  provider: 'openrouter' | 'openai';
  isStreaming?: boolean;
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

export type LlmCallStatus = 'success' | 'error';

export interface LlmCallRecord {
  id: string;
  createdAt: string;
  title: string;
  provider: 'openrouter' | 'openai';
  model: string;
  isStreaming: boolean;
  durationMs?: number;
  requestBody: unknown;
  response?: ChatCompletionResponse;
  error?: string;
  status: LlmCallStatus;
}

const LLM_CALLS_STORAGE_KEY = 'llm_calls';
const LLM_CALLS_MAX_LENGTH = 20;

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getLlmCallsQueue(): LlmCallRecord[] {
  if (typeof window === 'undefined') return [];
  const parsed = safeParseJson<unknown>(window.localStorage.getItem(LLM_CALLS_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed as LlmCallRecord[];
}

function setLlmCallsQueue(queue: LlmCallRecord[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LLM_CALLS_STORAGE_KEY, JSON.stringify(queue));
}

function enqueueLlmCall(record: LlmCallRecord) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLlmCallsQueue();
    const next = [...existing, record].slice(-LLM_CALLS_MAX_LENGTH);
    setLlmCallsQueue(next);
  } catch {
    // Best-effort logging; ignore storage quota / serialization errors.
  }
}

export function toApiMessage(message: Message): ApiMessage {
  return {
    role: message.role,
    content: message.content,
  };
}

// Client-side function to generate chat completion
export async function generateChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
  const startMs = Date.now();
  const callId = startMs.toString();

  try {
    const { title, messages, model, apiKey, provider, isStreaming = false, onUpdate } = options;

    // Check if the model is an Anthropic Claude model or other models that use max_completion_tokens
    const usesMaxCompletionTokens = 
      model.includes('claude') || 
      model.includes('o3-') ||
      model.includes('o1-');
    
    // Prepare the request body based on the model type
    const requestBody = {
      model: model,
      messages: messages,
      stream: isStreaming,
      ...(usesMaxCompletionTokens 
        ? { max_completion_tokens: 5000 } 
        : { temperature: 0, max_tokens: 5000 })
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

      if (!isStreaming) {
        const data = await response.json();
        const result = {
          content: data.choices[0].message.content,
          usage: data.usage,
        };

        enqueueLlmCall({
          id: callId,
          createdAt: new Date().toISOString(),
          title: title?.trim() || 'No title',
          provider,
          model,
          isStreaming,
          durationMs: Date.now() - startMs,
          requestBody,
          response: result,
          status: 'success',
        });

        return result;
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
              const content = line.slice(5);

              if (content.includes('[DONE]')) {
                break;
              }

              try {
                const data = JSON.parse(content);
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
                console.warn('Error parsing streaming response:', e, line);
              }
            }
          }
        }
      }

      const result = { 
        content: completeContent || 'No response generated',
        usage: totalTokens
      };

      enqueueLlmCall({
        id: callId,
        createdAt: new Date().toISOString(),
        title: title?.trim() || 'No title',
        provider,
        model,
        isStreaming,
        durationMs: Date.now() - startMs,
        requestBody,
        response: result,
        status: 'success',
      });

      return result;
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

      const result = { 
        content: completeContent || 'No response generated',
        usage: totalTokens
      };

      enqueueLlmCall({
        id: callId,
        createdAt: new Date().toISOString(),
        title: title?.trim() || 'No title',
        provider,
        model,
        isStreaming,
        durationMs: Date.now() - startMs,
        requestBody,
        response: result,
        status: 'success',
      });

      return result;
    }
  } catch (error) {
    console.error('Error generating chat completion:', error);
    try {
      const { title, messages, model, provider, isStreaming = false } = options;
      const usesMaxCompletionTokens =
        model.includes('claude') ||
        model.includes('o3-') ||
        model.includes('o1-');
      const requestBody = {
        model: model,
        messages: messages,
        stream: isStreaming,
        ...(usesMaxCompletionTokens
          ? { max_completion_tokens: 5000 }
          : { temperature: 0, max_tokens: 5000 })
      };

      enqueueLlmCall({
        id: callId,
        createdAt: new Date().toISOString(),
        title: title?.trim() || 'No title',
        provider,
        model,
        isStreaming,
        durationMs: Date.now() - startMs,
        requestBody,
        error: error instanceof Error ? error.message : String(error),
        status: 'error',
      });
    } catch {
      // ignore logging failures
    }
    throw new Error('Failed to generate response from AI');
  }
} 