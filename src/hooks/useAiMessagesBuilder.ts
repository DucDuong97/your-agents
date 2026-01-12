import { useCallback } from 'react';

import type { ChatAgent, Message } from '@/lib/db';
import { type ApiMessage } from '@/lib/openrouter';
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
        // Skip system messages as we already added our enhanced system prompt
        if (msg.role === 'system') continue;

        // Handle messages with images
        if (msg.rawContent && msg.role === 'user') {
          // If the message has structured content (for images), use it
          apiMessages.push({
            role: msg.role,
            content: JSON.parse(msg.rawContent),
          });
        } else {
          // Otherwise use the regular content
          apiMessages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }

      return apiMessages;
    },
    [selectedAgent]
  );
}

