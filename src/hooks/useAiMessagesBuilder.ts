import { useCallback } from 'react';

import type { ChatAgent, Message } from '@/lib/db';
import { toApiMessage, type ApiMessage } from '@/lib/openrouter';
import { getGlobalConfig } from '@/lib/storage';

export function useAiMessagesBuilder(selectedAgent: ChatAgent | null) {
  return useCallback(
    (messagesForApi: Message[]): ApiMessage[] => {
      if (!selectedAgent) return [];

      const apiMessages: ApiMessage[] = [];

      // Get user information from global config
      const { userNickname, userJobTitle } = getGlobalConfig();

      // Add the system prompt first
      const systemPrompt = selectedAgent.oneShotExample
        ? `${selectedAgent.systemPrompt}\n\n${selectedAgent.oneShotExample}`
        : selectedAgent.systemPrompt;
      let enhancedSystemPrompt = systemPrompt;

      // Add user information to the system prompt if available
      if (userNickname && userJobTitle) {
        const userInfoPrompt = `\n\nYou are chatting with ${userNickname}, who works as a ${userJobTitle}.`;
        enhancedSystemPrompt = `${systemPrompt}${userInfoPrompt}`;
      }

      apiMessages.push({
        role: 'system',
        content: enhancedSystemPrompt,
      });

      // Add the chat history
      for (const msg of messagesForApi) {
        const apiMessage = toApiMessage(msg);
        if (apiMessage) {
          apiMessages.push(apiMessage);
        }
      }

      return apiMessages;
    },
    [selectedAgent]
  );
}

