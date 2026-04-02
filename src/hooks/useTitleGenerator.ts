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

function extractMessageText(message: Message): string {
  if (message.rawContent) {
    try {
      const parsed: unknown = JSON.parse(message.rawContent);
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
  return message.content.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
}

export function useTitleGenerator({
  currentChat,
  selectedAgent,
  messages,
  setCurrentChat,
}: UseTitleGeneratorArgs): { isTitleGenerating: boolean } {
  const titleGeneratedForChatRef = useRef<string | null>(null);
  // Tracks "chatId:userMessageCount" to avoid re-triggering the periodic rename
  const lastPeriodicRenameKeyRef = useRef<string | null>(null);
  const [isTitleGenerating, setIsTitleGenerating] = useState(false);

  const { getApiKeyForAgentOrRedirect } = useApiKey();
  const apiKey = getApiKeyForAgentOrRedirect(selectedAgent);

  // Generate a title for the chat if it doesn't have one
  useEffect(() => {
    const maybeGenerateTitle = async () => {
      if (!currentChat || !selectedAgent || !apiKey) return;
      if (isTitleGenerating) return;

      const userMessages = messages.filter(msg => msg.role === 'user');

      // --- Initial title generation (first user message, still placeholder) ---
      const placeholderTitle = `New chat with ${selectedAgent.name}`;
      if (
        currentChat.title === placeholderTitle &&
        userMessages.length === 1 &&
        messages.filter(msg => msg.role === 'assistant').length === 0 &&
        titleGeneratedForChatRef.current !== currentChat.id
      ) {
        titleGeneratedForChatRef.current = currentChat.id;

        try {
          setIsTitleGenerating(true);
          const title = await generateChatTitle(
            extractMessageText(userMessages[0]),
            selectedAgent.provider,
            apiKey
          );
          await chatDB.update(currentChat.id, { title });
          setCurrentChat(prev => (prev ? { ...prev, title } : prev));
        } catch (error) {
          console.error('Error generating chat title:', error);
        } finally {
          setIsTitleGenerating(false);
        }
        return;
      }

      // --- Periodic rename every 5 user messages ---
      const count = userMessages.length;
      if (count > 0 && count % 5 === 0) {
        const periodicKey = `${currentChat.id}:${count}`;
        if (lastPeriodicRenameKeyRef.current === periodicKey) return;
        lastPeriodicRenameKeyRef.current = periodicKey;

        const last5 = userMessages.slice(-5).map(extractMessageText).join(' | ');

        try {
          setIsTitleGenerating(true);
          const title = await generateChatTitle(
            last5,
            selectedAgent.provider,
            apiKey
          );
          await chatDB.update(currentChat.id, { title });
          setCurrentChat(prev => (prev ? { ...prev, title } : prev));
        } catch (error) {
          console.error('Error regenerating chat title:', error);
        } finally {
          setIsTitleGenerating(false);
        }
      }
    };

    void maybeGenerateTitle();
  }, [currentChat, selectedAgent, messages, isTitleGenerating, apiKey, setCurrentChat]);

  return { isTitleGenerating };
}

