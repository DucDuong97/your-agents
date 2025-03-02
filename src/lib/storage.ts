import { GlobalConfig } from './types';

// Global Configuration Storage
export const getGlobalConfig = (): GlobalConfig => {
  if (typeof window === 'undefined') {
    return { openrouterApiKey: '', openaiApiKey: '' };
  }
  
  const openrouterApiKey = localStorage.getItem('openrouter_api_key') || '';
  const openaiApiKey = localStorage.getItem('openai_api_key') || '';
  
  return { openrouterApiKey, openaiApiKey };
};

export const saveGlobalConfig = (config: GlobalConfig): void => {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('openrouter_api_key', config.openrouterApiKey);
  localStorage.setItem('openai_api_key', config.openaiApiKey);
}; 