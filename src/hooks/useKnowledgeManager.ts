'use client';

import { useCallback, useState } from 'react';

import type { ChatAgent, Message } from '@/lib/db';
import { agentDB } from '@/lib/db';
import { generateChatCompletion, type ApiMessage, type ContentItem } from '@/lib/openrouter';
import { normalizeString, getMessageText, stripFences, extractToolCallsForLastAssistant, getLastMessageByRole } from '@/lib/aiMessageUtils';
import { useApiKey } from './useApiKey';

export function useKnowledgeManager(agent: ChatAgent | null | undefined) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { getApiKeyForAgentOrRedirect } = useApiKey();

  const generateKnowledge = useCallback(async (messages: Message[]) => {
    if (!agent) return null;

    const kgPrompt = agent.knowledgeGenerationPrompt;
    if (!kgPrompt) return null;

    const apiKey = getApiKeyForAgentOrRedirect(agent);
    if (!apiKey) {
      console.warn('[useKnowledgeGenerator] Missing API key; skipping knowledge generation.');
      return null;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const lastUserMessage = getMessageText(getLastMessageByRole(messages, 'user'));
      const lastAssistantResponse = getMessageText(getLastMessageByRole(messages, 'assistant'));
      const toolCalls = extractToolCallsForLastAssistant(messages);

      const response = await generateChatCompletion({
        title: 'Knowledge Generation',
        provider: agent.provider,
        model: agent.modelName,
        apiKey,
        messages: [
          {
            role: 'system',
            content: KNOWLEDGE_GENERATION_PROMPT.replace('{{knowledge_generation_prompt}}', kgPrompt),
          },
          {
            role: 'user',
            content: KNOWLEDGE_GENERATION_USER_MESSAGE
              .replace('{{user_message}}', lastUserMessage)
              .replace('{{assistant_response}}', lastAssistantResponse)
              .replace('{{tool_calls}}', toolCalls),
          },
        ],
      });

      const raw = stripFences(response.content);
      if (raw === 'NONE') return null;

      const updated = appendKnowledge(agent.knowledge, raw);
      await agentDB.update(agent.id, { knowledge: updated });
      return updated;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate knowledge.';
      console.error('[useKnowledgeGenerator] Error:', e);
      setError(msg);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [agent, getApiKeyForAgentOrRedirect]);


  const buildKnowledgeSystemMessage = useCallback(async (apiMessages: ApiMessage[]) => {
    if (!agent) return { knowledgeSystemMessage: null as Message | null };

    const knowledge = agent.knowledge;
    const knowledgeKeys = knowledge ? Object.keys(knowledge)
      .filter((k) => k.trim().length > 0)
      .filter((k) => knowledge?.[k]?.length > 0)
    : [];

    if (knowledgeKeys.length === 0) {
      return { knowledgeSystemMessage: null as Message | null };
    }

    const apiKey = getApiKeyForAgentOrRedirect(agent);
    if (!apiKey) {
      return { knowledgeSystemMessage: null as Message | null };
    }

    const latestUserMessage = getLastUserApiMessageText(apiMessages);
    if (!latestUserMessage) {
      return { knowledgeSystemMessage: null as Message | null };
    }

    const usedKeys = extractUsedKnowledgeKeys(apiMessages);
    const remainingKeys = knowledgeKeys.filter((k) => !usedKeys.has(k));
    if (remainingKeys.length === 0) {
      return { knowledgeSystemMessage: null as Message | null };
    }

    const selectedKeys = await selectRelevantKnowledgeKeys({
      provider: agent.provider,
      model: agent.modelName,
      apiKey,
      knowledgeKeys: remainingKeys,
      latestUserMessage,
    });

    if (selectedKeys.length === 0) {
      return { knowledgeSystemMessage: null as Message | null };
    }

    const knowledgeLines: string[] = [];
    for (const key of selectedKeys) {
      const values = knowledge?.[key];
      knowledgeLines.push(`- ${key}: ${values?.slice(-5).join(' | ')}`);
    }

    if (knowledgeLines.length === 0) {
      return { knowledgeSystemMessage: null as Message | null };
    }

    const knowledgeSystemMessage: Message = {
      role: 'system',
      id: `${Date.now()}-knowledge`,
      createdAt: new Date().toISOString(),
      content: [
        '[KNOWLEDGE]',
        'Relevant stored knowledge (use if helpful):',
        ...knowledgeLines,
      ].join('\n'),
    };

    return { knowledgeSystemMessage };
  },
  [getApiKeyForAgentOrRedirect, agent]
  );

  return { generateKnowledge, buildKnowledgeSystemMessage, isGenerating, error };
}

async function selectRelevantKnowledgeKeys(args: {
  provider: ChatAgent['provider'];
  model: string;
  apiKey: string;
  knowledgeKeys: string[];
  latestUserMessage: string;
}): Promise<string[]> {
  const { provider, model, apiKey, knowledgeKeys, latestUserMessage } = args;
  if (!knowledgeKeys.length) return [];
  if (!latestUserMessage.trim()) return [];

  const prompt = SELECT_KNOWLEDGE_KEYS_PROMPT
    .replace('{{knowledge_keys}}', JSON.stringify(knowledgeKeys))
    .replace('{{latest_user_message}}', latestUserMessage);

  const resp = await generateChatCompletion({
    title: 'Knowledge Key Selection',
    provider,
    model,
    apiKey,
    messages: [
      { role: 'system', content: 'You select relevant knowledge keys. Return JSON only.' },
      { role: 'user', content: prompt },
    ],
  });

  try {
    const parsed = JSON.parse(resp.content);
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(knowledgeKeys);
    return parsed
      .filter((k) => typeof k === 'string')
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && allowed.has(k));
  } catch {
    // If the model didn't return JSON, fail closed (no keys)
    return [];
  }
}

// HELPER FUNCTIONS


function parseKeyValueEntry(raw: string): { key: string; value: string } | null {
  const text = stripFences(raw);
  const lines = text.split('\n').map((l) => l.trim());

  const keyLine = lines.find((l) => /^key\s*:/i.test(l));
  const valueLineIndex = lines.findIndex((l) => /^value\s*:/i.test(l));

  const key = keyLine ? normalizeString(keyLine.replace(/^key\s*:/i, '')) : '';
  if (!key) return null;

  if (valueLineIndex === -1) return null;

  const firstValue = normalizeString(lines[valueLineIndex].replace(/^value\s*:/i, ''));
  const extraValueLines = lines
    .slice(valueLineIndex + 1)
    .filter((l) => l.length > 0 && !/^key\s*:/i.test(l) && !/^value\s*:/i.test(l));

  const value = normalizeString([firstValue, ...extraValueLines].filter(Boolean).join('\n'));
  if (!value) return null;

  return { key, value };
}

function parseKeyValueEntry2(raw: string): { key: string; value: string } | null {
  const text = stripFences(raw).split(':');
  if (text.length < 2) return null;

  const key = text[0].trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return null;

  const value = text.slice(1).join(':').trim();
  if (!value) return null;

  return { key, value };
}

function appendKnowledge(
  existing: Record<string, string[]> | undefined,
  entryRaw: string
): Record<string, string[]> {
  const parsed = parseKeyValueEntry(entryRaw) || parseKeyValueEntry2(entryRaw);
  if (!parsed) return existing ?? {};

  const next: Record<string, string[]> = { ...(existing ?? {}) };
  const prevList = Array.isArray(next[parsed.key]) ? next[parsed.key] : [];
  next[parsed.key] = [...prevList, parsed.value].slice(-50); // cap per-key history
  return next;
}

function isKnowledgeSystemApiMessage(m: ApiMessage): boolean {
  if (m.role !== 'system') return false;
  if (typeof m.content === 'string') return m.content.includes('[KNOWLEDGE]');
  // If content is multipart, check text parts
  if (Array.isArray(m.content)) {
    return (m.content as ContentItem[]).some(
      (c) => c?.type === 'text' && typeof c.text === 'string' && c.text.includes('[KNOWLEDGE]')
    );
  }
  return false;
}

function extractKeysFromKnowledgeSystemContent(content: ApiMessage['content']): string[] {
  const text = apiContentToText(content);
  if (!text.includes('[KNOWLEDGE]')) return [];

  const keys: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*-\s*([^:]+)\s*:/);
    if (!m?.[1]) continue;
    const key = m[1].trim();
    if (key) keys.push(key);
  }
  return keys;
}

function extractUsedKnowledgeKeys(apiMessages: ApiMessage[]): Set<string> {
  const usedKeys = new Set<string>();

  for (const m of apiMessages) {
    if (isKnowledgeSystemApiMessage(m)) {
      for (const k of extractKeysFromKnowledgeSystemContent(m.content)) {
        usedKeys.add(k);
      }
      continue;
    }
  }

  return usedKeys;
}

function apiContentToText(content: ApiMessage['content']): string {
  if (typeof content === 'string') return normalizeString(content);
  if (!Array.isArray(content)) return '';
  const parts = (content as ContentItem[])
    .map((c) => (c?.type === 'text' && typeof c.text === 'string' ? c.text : ''))
    .filter(Boolean);
  return normalizeString(parts.join('\n'));
}

function getLastUserApiMessageText(apiMessages: ApiMessage[]): string {
  for (let i = apiMessages.length - 1; i >= 0; i--) {
    const m = apiMessages[i];
    if (m?.role === 'user') return apiContentToText(m.content);
  }
  return '';
}

// PROMPTS

const KNOWLEDGE_GENERATION_PROMPT = `
You are a knowledge extraction assistant. You write concise, high-signal memory entries for future conversations.

You will be given the last user message, the assistant's response, and the tool calls used to generate the response. You will need to extract the knowledge from those messages and return it in a structured format.

A knowledge entry should be a key-value pair. The key should be a short, descriptive name for the knowledge. The value should be a concise summary of the knowledge related to the key's name.

Task:
- Produce ONE new knowledge entry to append to the existing knowledge.
- Prefer durable facts, and stable context.
- Avoid ephemeral details unless clearly important long-term.
- Output plain text only, no markdown headings, no code fences.
- If there is nothing worth saving, output exactly: NONE

Output format:
\`\`\`
key: a_short_descriptive_name
value: This is a concise summary of the knowledge related to the key's name.
\`\`\`

The knowledge output should follow the following prompt:
{{knowledge_generation_prompt}}
`;

const KNOWLEDGE_GENERATION_USER_MESSAGE = `
<UserMessage>
{{user_message}}
</UserMessage>

<AssistantResponse>
{{assistant_response}}
</AssistantResponse>

<ToolCalls>
{{tool_calls}}
</ToolCalls>
`;


const SELECT_KNOWLEDGE_KEYS_PROMPT = `
Given the user message and the available knowledge keys, select the minimal set of keys needed to help answer the user.
Return ONLY a JSON array of strings (the selected keys).
If none are needed, return [] exactly.

<AvailableKnowledgeKeys>
{{knowledge_keys}}
</AvailableKnowledgeKeys>

<LatestUserMessage>
{{latest_user_message}}
</LatestUserMessage>
`;