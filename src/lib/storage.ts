import { GlobalConfig, UserActivity } from './types';

// Helper to check if we're in a browser environment
const isBrowser = (): boolean => typeof window !== 'undefined';

// Default values for server-side rendering
const defaultGlobalConfig: GlobalConfig = {
  openrouterApiKey: '',
  openaiApiKey: '',
  userNickname: '',
  userJobTitle: ''
};

const defaultUserActivity: UserActivity = {
  dailyMessageCounts: {},
  currentStreak: 0,
  longestStreak: 0
};

// Global Configuration Storage
export const getGlobalConfig = (): GlobalConfig => {
  if (!isBrowser()) {
    return defaultGlobalConfig;
  }
  
  const openrouterApiKey = localStorage.getItem('openrouter_api_key') || '';
  const openaiApiKey = localStorage.getItem('openai_api_key') || '';
  const userNickname = localStorage.getItem('user_nickname') || '';
  const userJobTitle = localStorage.getItem('user_job_title') || '';
  
  return { openrouterApiKey, openaiApiKey, userNickname, userJobTitle };
};

export const saveGlobalConfig = (config: GlobalConfig): void => {
  if (!isBrowser()) return;
  
  localStorage.setItem('openrouter_api_key', config.openrouterApiKey);
  localStorage.setItem('openai_api_key', config.openaiApiKey);
  
  if (config.userNickname !== undefined) {
    localStorage.setItem('user_nickname', config.userNickname);
  }
  
  if (config.userJobTitle !== undefined) {
    localStorage.setItem('user_job_title', config.userJobTitle);
  }
};

// User Activity Tracking
export const getUserActivity = (): UserActivity => {
  if (!isBrowser()) {
    return defaultUserActivity;
  }
  
  const storedData = localStorage.getItem('user_activity');
  if (!storedData) {
    return defaultUserActivity;
  }
  
  try {
    return JSON.parse(storedData) as UserActivity;
  } catch (e) {
    console.error('Failed to parse user activity data', e);
    return defaultUserActivity;
  }
};

export const saveUserActivity = (activity: UserActivity): void => {
  if (!isBrowser()) return;
  
  localStorage.setItem('user_activity', JSON.stringify(activity));
};

export const trackMessageSent = (): void => {
  if (!isBrowser()) return;
  
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const activity = getUserActivity();
  
  // Update the count for today
  activity.dailyMessageCounts[today] = (activity.dailyMessageCounts[today] || 0) + 1;
  
  // Check if we need to update streak information
  if (!activity.lastActiveDate) {
    // First activity ever
    activity.currentStreak = 1;
    activity.longestStreak = 1;
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (activity.lastActiveDate === today) {
      // Already recorded activity today, just updating the count
    } else if (activity.lastActiveDate === yesterdayStr) {
      // Consecutive day, increase streak
      activity.currentStreak += 1;
      activity.longestStreak = Math.max(activity.longestStreak, activity.currentStreak);
    } else {
      // Streak broken, reset to 1
      activity.currentStreak = 1;
    }
  }
  
  // Update the last active date
  activity.lastActiveDate = today;
  
  // Save the updated activity
  saveUserActivity(activity);
}; 