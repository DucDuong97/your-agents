export interface GlobalConfig {
  openrouterApiKey: string;
  openaiApiKey: string;
  userNickname?: string;
  userJobTitle?: string;
}

// Interface for activity tracking
export interface UserActivity {
  // Maps ISO date strings (YYYY-MM-DD) to message counts
  dailyMessageCounts: Record<string, number>;
  // Last date when a message was sent (ISO format)
  lastActiveDate?: string;
  // Current streak (consecutive days)
  currentStreak: number;
  // Longest streak achieved
  longestStreak: number;
}