import type { Message } from '@/lib/db';
import type { ContentItem } from '@/lib/openrouter';

export function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Extracts text content from OpenAI/OpenRouter multi-part `rawContent` messages.
 * Includes an `[image omitted]` placeholder for images.
 */
export function safeExtractTextFromRawContent(rawContent: string): string | null {
  try {
    const parsed = JSON.parse(rawContent) as unknown;
    if (!Array.isArray(parsed)) return null;

    const items = parsed as ContentItem[];
    const textParts = items
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        if (item.type === 'text' && typeof item.text === 'string') return item.text;
        if (item.type === 'image_url') return '[image omitted]';
        return '';
      })
      .filter(Boolean);

    const joined = textParts.join('\n').trim();
    return joined.length ? joined : null;
  } catch {
    return null;
  }
}

export function getMessageText(message: Message | null): string {
  if (!message) return '';
  const fromRaw = message.rawContent ? safeExtractTextFromRawContent(message.rawContent) : null;
  const base = fromRaw ?? message.content ?? '';
  return normalizeString(base).replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[image omitted]');
}

/**
 * User-only helper: extracts *only* the user text parts (ignores images) from `rawContent`.
 * Falls back to `msg.content` if parsing fails or there's no text part.
 */
export function safeExtractUserText(msg: Message): string {
  if (msg.rawContent && msg.role === 'user') {
    try {
      const parsed = JSON.parse(msg.rawContent) as unknown;
      if (!Array.isArray(parsed)) return normalizeString(msg.content);
      const items = parsed as ContentItem[];
      const text = items
        .map((it) => (it?.type === 'text' && typeof it.text === 'string' ? it.text : ''))
        .filter(Boolean)
        .join('\n');
      return normalizeString(text) || normalizeString(msg.content);
    } catch {
      return normalizeString(msg.content);
    }
  }
  return normalizeString(msg.content);
}

export function stripFences(text: string): string {
  const trimmed = text.trim();
  // Remove surrounding ``` blocks if present
  const fenceMatch = trimmed.match(/^```[\s\S]*?\n([\s\S]*?)\n```$/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  return trimmed;
}

export function getLastUserMessageText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === 'user') return safeExtractUserText(m);
  }
  return '';
}

export function getLastMessageByRole(messages: Message[], role: Message['role']): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === role) return messages[i];
  }
  return null;
}

export function extractToolCallsForLastAssistant(messages: Message[]): string {
  const lastAssistant = getLastMessageByRole(messages, 'assistant');
  const snapshot = lastAssistant?.agentRunSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.resultsByTask) return '';

  let output = '';
  for (const task of snapshot.resultsByTask) {
    output += `# ${task.task}:\n`;
    for (const result of task.results) {
      output += `## ${result.name}: ${JSON.stringify(result.arguments)}\n`;
      output += `${result.result?.content?.map((c) => c.text).join('\n') ?? 'No content'}\n\n`;
    }
    output += '\n';
  }
  return output.trim();
}