'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getGlobalConfig } from '@/lib/storage';
import type { ChatAgent } from '@/lib/db';

type Provider = ChatAgent['provider'];

function normalizeKey(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  return trimmed.length ? trimmed : null;
}

export function useApiKey() {
  const router = useRouter();

  const getApiKeyForProvider = useCallback((provider: Provider): string | null => {
    const config = getGlobalConfig();
    const key = provider === 'openrouter' ? config.openrouterApiKey : config.openaiApiKey;
    return normalizeKey(key);
  }, []);

  const getApiKeyForAgent = useCallback(
    (agent: ChatAgent | null | undefined): string | null => {
      if (!agent) return null;
      return getApiKeyForProvider(agent.provider);
    },
    [getApiKeyForProvider]
  );

  const getApiKeyForAgentOrRedirect = useCallback(
    (agent: ChatAgent | null | undefined, redirectTo = '/home'): string | null => {
      const apiKey = getApiKeyForAgent(agent);
      if (!apiKey) {
        router.push(redirectTo);
        return null;
      }
      return apiKey;
    },
    [getApiKeyForAgent, router]
  );

  return { getApiKeyForProvider, getApiKeyForAgent, getApiKeyForAgentOrRedirect };
}


