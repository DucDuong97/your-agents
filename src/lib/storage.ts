import { GlobalConfig } from './types';

// Global Configuration Storage
export const getGlobalConfig = (): GlobalConfig => {
  if (typeof window === 'undefined') {
    return { openrouterApiKey: '', openaiApiKey: '', userNickname: '', userJobTitle: '' };
  }
  
  const openrouterApiKey = localStorage.getItem('openrouter_api_key') || '';
  const openaiApiKey = localStorage.getItem('openai_api_key') || '';
  const userNickname = localStorage.getItem('user_nickname') || '';
  const userJobTitle = localStorage.getItem('user_job_title') || '';
  
  return { openrouterApiKey, openaiApiKey, userNickname, userJobTitle };
};

export const saveGlobalConfig = (config: GlobalConfig): void => {
  if (typeof window === 'undefined') return;
  
  localStorage.setItem('openrouter_api_key', config.openrouterApiKey);
  localStorage.setItem('openai_api_key', config.openaiApiKey);
  
  if (config.userNickname !== undefined) {
    localStorage.setItem('user_nickname', config.userNickname);
  }
  
  if (config.userJobTitle !== undefined) {
    localStorage.setItem('user_job_title', config.userJobTitle);
  }
}; 