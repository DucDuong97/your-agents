import { useEffect, useRef, useState } from 'react';

import { chatDB, type Chat, type ChatAgent, type Message } from '@/lib/db';
import { generateChatTitle } from '@/lib/promptUtils';
import { useApiKey } from './useApiKey';

type UseTitleGeneratorArgs = {
  currentChat: Chat | null;
  selectedAgent: ChatAgent | null;
  messages: Message[];
  setCurrentChat: React.Dispatch<React.SetStateAction<Chat | null>>;
};

export function useTitleGenerator({
  currentChat,
  selectedAgent,
  messages,
  setCurrentChat,
}: UseTitleGeneratorArgs): { isTitleGenerating: boolean } {
  const titleGeneratedForChatRef = useRef<string | null>(null);
  const [isTitleGenerating, setIsTitleGenerating] = useState(false);

  const { getApiKeyForAgentOrRedirect } = useApiKey();
  const apiKey = getApiKeyForAgentOrRedirect(selectedAgent);

  // Generate a title for the chat if it doesn't have one
  useEffect(() => {
    const maybeGenerateTitle = async () => {
      if (!currentChat || !selectedAgent) return;
      if (isTitleGenerating) return;

      const placeholderTitle = `New chat with ${selectedAgent.name}`;
      if (currentChat.title !== placeholderTitle) return;

      const userMessages = messages.filter(msg => msg.role === 'user');
      const assistantMessages = messages.filter(msg => msg.role === 'assistant');
      if (userMessages.length !== 1) return;
      if (assistantMessages.length > 0) return;

      if (titleGeneratedForChatRef.current === currentChat.id) return;

      // Mark as attempted so we don't spam title generation on re-renders
      titleGeneratedForChatRef.current = currentChat.id;

      const firstUserMessage = userMessages[0];
      const firstMessageText = (() => {
        if (firstUserMessage.rawContent) {
          try {
            const parsed: unknown = JSON.parse(firstUserMessage.rawContent);
            if (Array.isArray(parsed)) {
              const textParts = parsed
                .map((item: unknown) => {
                  if (!item || typeof item !== 'object') return '';
                  const maybeType = (item as { type?: unknown }).type;
                  if (maybeType !== 'text') return '';
                  const maybeText = (item as { text?: unknown }).text;
                  return typeof maybeText === 'string' ? maybeText : '';
                })
                .join(' ')
                .trim();
              if (textParts) return textParts;
            }
          } catch {
            // Fall back below
          }
        }

        // Avoid including giant image data URLs from markdown embeds
        return firstUserMessage.content.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
      })();

      try {
        setIsTitleGenerating(true);

        const title = await generateChatTitle(
          firstMessageText,
          selectedAgent.provider,
          apiKey!
        );

        await chatDB.update(currentChat.id, { title });

        // Update local state immediately so header reflects new title without reload
        setCurrentChat(prev => (prev ? { ...prev, title } : prev));
      } catch (error) {
        console.error('Error generating chat title:', error);
      } finally {
        setIsTitleGenerating(false);
      }
    };

    void maybeGenerateTitle();
  }, [currentChat, selectedAgent, messages, isTitleGenerating, apiKey, setCurrentChat]);

  return { isTitleGenerating };
}

