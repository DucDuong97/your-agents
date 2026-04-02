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
  const [lastGeneratedEntry, setLastGeneratedEntry] = useState<{ key: string; value: string } | null>(null);
  const [noKnowledgeReason, setNoKnowledgeReason] = useState<string | null>(null);

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
    setNoKnowledgeReason(null);

    try {
      const lastUserMessage = getMessageText(getLastMessageByRole(messages, 'user'));
      const lastAssistantResponse = getMessageText(getLastMessageByRole(messages, 'assistant'));
      const lastToolCalls = extractToolCallsForLastAssistant(messages);

      const response = await generateChatCompletion({
        title: 'Knowledge Generation',
        provider: agent.provider,
        model: 'openai/o3',
        apiKey,
        messages: [
          {
            role: 'system',
            content: KNOWLEDGE_GENERATION_PROMPT
              .replace('{{knowledge_generation_prompt}}', kgPrompt)
              .replace('{{current_knowledge}}', agent.knowledge ? Object.entries(agent.knowledge).map(([key, ]) => key).join(', ') : ""),
          },
          {
            role: 'user',
            content: KNOWLEDGE_GENERATION_USER_MESSAGE
              .replace('{{conversation}}', messages.map((m) => `<${m.role}>${m.content}</${m.role}>`).join('\n'))
              .replace('{{user_message}}', lastUserMessage)
              .replace('{{assistant_response}}', lastAssistantResponse)
              .replace('{{tool_calls}}', lastToolCalls),
          },
        ],
      });

      const raw = stripFences(response.content);
      console.log('raw', raw);
      if (raw.startsWith('NONE')) {
        const reasonMatch = raw.match(/^NONE\s*\(([^)]+)\)/);
        const reason = reasonMatch ? reasonMatch[1].trim() : 'No relevant knowledge to extract from this conversation.';
        setNoKnowledgeReason(reason);
        setLastGeneratedEntry(null);
        return null;
      }

      const parsed = parseKeyValueEntry(raw) || parseKeyValueEntry2(raw);
      console.log('parsed', parsed);
      if (parsed) {
        setLastGeneratedEntry(parsed);
      } else {
        setNoKnowledgeReason('Could not parse the generated knowledge entry.');
        setLastGeneratedEntry(null);
      }

      // Do not persist knowledge here; wait for explicit user confirmation.
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate knowledge.';
      console.error('[useKnowledgeGenerator] Error:', e);
      setError(msg);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [agent, getApiKeyForAgentOrRedirect]);

  const confirmLastGeneratedKnowledge = useCallback(
    async (key: string, value: string) => {
      if (!agent || !lastGeneratedEntry) return null;

      const trimmedKey = key.trim();
      const trimmedValue = value.trim();
      if (!trimmedKey || !trimmedValue) {
        return null;
      }

      const latestAgent = await agentDB.get(agent.id);
      const baseAgent = latestAgent ?? agent;
      const existing = baseAgent.knowledge ?? {};

      const updatedKnowledge: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(existing)) {
        updatedKnowledge[k] = Array.isArray(v) ? [...v] : [];
      }

      const prevList = Array.isArray(updatedKnowledge[trimmedKey])
        ? updatedKnowledge[trimmedKey]
        : [];
      updatedKnowledge[trimmedKey] = [...prevList, trimmedValue].slice(-10);

      const saved = await agentDB.update(baseAgent.id, { knowledge: updatedKnowledge });
      setLastGeneratedEntry(null);
      return saved;
    },
    [agent, lastGeneratedEntry]
  );

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
    const loadedKeys = new Set<string>(selectedKeys);

    for (const key of selectedKeys) {
      const values = knowledge?.[key];
      const joined = values?.slice(-5).join(' | ') ?? '';
      knowledgeLines.push(`- ${key}: ${joined}`);

      // Resolve 1 level of sub-knowledge references wrapped in **SubKey**
      const subKeyMatches = joined.matchAll(/\*\*([^*]+)\*\*/g);
      for (const match of subKeyMatches) {
        const subKey = match[1].trim();
        if (!loadedKeys.has(subKey) && knowledge?.[subKey]?.length) {
          loadedKeys.add(subKey);
          knowledgeLines.push(`  - ${subKey}: ${knowledge[subKey].slice(-5).join(' | ')}`);
        }
      }
    }

    if (knowledgeLines.length === 0) {
      return { knowledgeSystemMessage: null as Message | null };
    }

    const knowledgeSystemMessage: Message = {
      role: 'system',
      id: `${Date.now()}-knowledge`,
      createdAt: new Date().toISOString(),
      content: '[KNOWLEDGE] Used knowledge: ' + selectedKeys.join(', '),
      rawContent: [
        '[KNOWLEDGE]',
        'Relevant stored knowledge (use if helpful):',
        ...knowledgeLines,
      ].join('\n'),
    };

    return { knowledgeSystemMessage };
  },
  [getApiKeyForAgentOrRedirect, agent]
  );

  const updateKnowledgeEntry = useCallback(
    async (originalKey: string, newKey: string, value: string, originalValues: string[]) => {
      if (!agent) return null;

      const trimmedNewKey = newKey.trim();
      const trimmedValue = value.trim();
      if (!trimmedNewKey || !trimmedValue) {
        return null;
      }

      const latestAgent = await agentDB.get(agent.id);
      const baseAgent = latestAgent ?? agent;
      const existing = baseAgent.knowledge ?? {};

      const updatedKnowledge: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(existing)) {
        updatedKnowledge[k] = Array.isArray(v) ? [...v] : [];
      }

      // If key was renamed, remove the original key
      if (originalKey !== trimmedNewKey && updatedKnowledge[originalKey]) {
        delete updatedKnowledge[originalKey];
      }

      // Update or create the new key with the edited value
      if (originalKey === trimmedNewKey && originalValues.length > 0) {
        // Same key, replace the last value
        const updatedValues = [...originalValues];
        updatedValues[updatedValues.length - 1] = trimmedValue;
        updatedKnowledge[trimmedNewKey] = updatedValues;
      } else if (originalKey === trimmedNewKey) {
        // Same key, no previous values, create new
        updatedKnowledge[trimmedNewKey] = [trimmedValue];
      } else {
        // Key renamed - move values to new key and update last one
        if (originalValues.length > 0) {
          const updatedValues = [...originalValues];
          updatedValues[updatedValues.length - 1] = trimmedValue;
          updatedKnowledge[trimmedNewKey] = updatedValues;
        } else {
          updatedKnowledge[trimmedNewKey] = [trimmedValue];
        }
      }

      const saved = await agentDB.update(baseAgent.id, { knowledge: updatedKnowledge });
      return saved;
    },
    [agent]
  );

  return {
    generateKnowledge,
    buildKnowledgeSystemMessage,
    isGenerating,
    error,
    lastGeneratedEntry,
    noKnowledgeReason,
    setNoKnowledgeReason,
    confirmLastGeneratedKnowledge,
    updateKnowledgeEntry,
  };
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

// Note: appending/saving knowledge is now handled at the call site after user confirmation.

function isKnowledgeSystemApiMessage(m: ApiMessage): boolean {
  if (m.role !== 'system') return false;
  if (typeof m.content === 'string') return m.content.startsWith('[KNOWLEDGE]');
  // If content is multipart, check text parts
  if (Array.isArray(m.content)) {
    return (m.content as ContentItem[]).some(
      (c) => c?.type === 'text' && typeof c.text === 'string' && c.text.startsWith('[KNOWLEDGE]')
    );
  }
  return false;
}

function extractKeysFromKnowledgeSystemContent(content: ApiMessage['content']): string[] {
  const text = apiContentToText(content);
  if (!text.startsWith('[KNOWLEDGE]')) return [];

  // text is like: [KNOWLEDGE] Used knowledge: key1, key2, key3
  const parts = text.split(':');
  if (parts.length < 2) return [];
  const keys = parts[1].split(',').map((k) => k.trim()).filter((k) => k.length > 0);
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

You will be given the conversation history of a chat session. You will need to extract the knowledge from those messages and return it in a structured format.

A knowledge entry should be a key-value pair. The key should be a short, descriptive name for the knowledge. The value should be a concise summary of the knowledge related to the key's name.

# Task:
- Produce at most ONE new knowledge entry to append to the existing knowledge.
- If there is nothing worth saving, output exactly: NONE (reason why no knowledge is needed).

# Output format:
\`\`\`
key: a_short_descriptive_name
value: This is a concise summary of the knowledge related to the key's name.
\`\`\`

# Example:
\`\`\`
key: The current date and time
value: The current date and time can be obtained by using **CurrentDateFunction** and **CurrentTimeFunction**
\`\`\`

# The knowledge output should follow the following prompt:
{{knowledge_generation_prompt}}

# And, please do not produce new knowledge entries that might be duplicated with the existing knowledge. Here is the current knowledge keys:
{{current_knowledge}}

# Notes:
- Prefer durable facts, and stable context.
- Avoid ephemeral details unless clearly important long-term. For example, if user asks about getting the information of "Alex", you can save the workflow of retrieving personal information by a name as knowledge, instead the workflow of retrieving personal information of Alex.
- Output plain text only, no markdown headings, no code fences.
- Please follow the output format strictly.
- You can mention other knowledge in the value by wrapping the key in double asterisk like the example above.
`;

const KNOWLEDGE_GENERATION_USER_MESSAGE = `
<Conversation>
{{conversation}}
</Conversation>

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