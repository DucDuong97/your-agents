import React, { useMemo } from 'react';
import { UserActivity } from '@/lib/types';

interface ActivityHeatmapProps {
  activity: UserActivity;
  weeks?: number; // Number of weeks to display
}

export default function ActivityHeatmap({ activity, weeks = 12 }: ActivityHeatmapProps) {
  // Generate dates for the heatmap
  const heatmapData = useMemo(() => {
    const today = new Date();
    const data: Array<{date: string; count: number}> = [];
    
    // Generate dates for the last 'weeks' weeks
    for (let i = 0; i < weeks * 7; i++) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      data.unshift({
        date: dateString,
        count: activity.dailyMessageCounts[dateString] || 0
      });
    }
    
    return data;
  }, [activity, weeks]);
  
  // Group data by week for display
  const groupedByWeek = useMemo(() => {
    const weeks: Array<Array<{date: string; count: number}>> = [];
    let currentWeek: Array<{date: string; count: number}> = [];
    
    heatmapData.forEach((day, index) => {
      // Create a date object from the string
      const date = new Date(day.date);
      // If it's Sunday or the first day, start a new week
      if (date.getDay() === 0 || index === 0) {
        if (currentWeek.length > 0) {
          weeks.push(currentWeek);
        }
        currentWeek = [];
      }
      // Add this day to the current week
      currentWeek.push(day);
      
      // If we're at the end, add the final week
      if (index === heatmapData.length - 1) {
        weeks.push(currentWeek);
      }
    });
    
    return weeks;
  }, [heatmapData]);
  
  // Calculate badges based on activity
  const badges = useMemo(() => {
    // Total messages sent
    const totalMessages = Object.values(activity.dailyMessageCounts).reduce((sum, count) => sum + count, 0);
    
    // Max messages in a single day
    const maxMessagesInDay = Math.max(...Object.values(activity.dailyMessageCounts), 0);
    
    // Estimate number of chat sessions 
    // Assumption: On average, a new session is started every 5-10 messages
    const estimatedSessions = Math.ceil(totalMessages / 7);
    
    // Estimate the longest conversation by assuming the day with most messages
    // represents the longest sustained conversation
    const longestConversation = maxMessagesInDay;
    
    return [
      {
        name: "Chat Sessions",
        level: estimatedSessions >= 20 ? "Gold" : estimatedSessions >= 10 ? "Silver" : estimatedSessions >= 3 ? "Bronze" : "Starter",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        ),
        value: estimatedSessions,
        description: "chat sessions created"
      },
      {
        name: "Longest Conversation",
        level: longestConversation >= 20 ? "Gold" : longestConversation >= 10 ? "Silver" : longestConversation >= 5 ? "Bronze" : "Starter",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
        ),
        value: longestConversation,
        description: "messages in longest conversation"
      }
    ];
  }, [activity]);
  
  // Get color for a cell based on count
  const getCellColor = (count: number) => {
    if (count === 0) return 'bg-gray-100 dark:bg-gray-700';
    if (count < 3) return 'bg-green-100 dark:bg-green-900';
    if (count < 6) return 'bg-green-300 dark:bg-green-700';
    if (count < 10) return 'bg-green-500 dark:bg-green-500';
    return 'bg-green-700 dark:bg-green-300';
  };
  
  // Get badge color
  const getBadgeColor = (level: string) => {
    switch (level) {
      case "Gold":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100";
      case "Silver":
        return "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200";
      case "Bronze":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };
  
  // Get tooltip text based on count - avoid date.toLocaleDateString() which can cause hydration errors
  const getTooltipText = (date: string, count: number) => {
    // Use static date format to avoid locale differences between server and client
    const [year, month, day] = date.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedDate = `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
    
    if (count === 0) {
      return `No messages on ${formattedDate}`;
    } else if (count === 1) {
      return `1 message on ${formattedDate}`;
    } else {
      return `${count} messages on ${formattedDate}`;
    }
  };
  
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow-sm">
    {/* Activity content with responsive layout */}
    <div className="flex flex-col md:flex-row gap-6">
      <div className="flex-1">
        <div className="mb-3 flex items-center">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Your Message Activity
          </h3>
          {/* Streak chip with fire icon */}
          <div className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11.985c.001.01-.001.021 0 .031C12 13 9.878 15.334 9.879 16.121z" />
            </svg>
            {activity.currentStreak} day{activity.currentStreak !== 1 ? 's' : ''}
          </div>
        </div>
      
        <div className="overflow-x-auto pb-2">
          <div className="heatmap flex gap-1">
            {groupedByWeek.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map(day => (
                  <div
                    key={day.date}
                    className={`w-3 h-3 rounded-sm ${getCellColor(day.count)}`}
                    title={getTooltipText(day.date, day.count)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        
        <div className="mt-3 flex justify-between items-center text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1">
            Less
            <span className="ml-1 inline-block w-2 h-2 rounded-sm bg-gray-100 dark:bg-gray-700"></span>
            <span className="inline-block w-2 h-2 rounded-sm bg-green-100 dark:bg-green-900"></span>
            <span className="inline-block w-2 h-2 rounded-sm bg-green-300 dark:bg-green-700"></span>
            <span className="inline-block w-2 h-2 rounded-sm bg-green-500 dark:bg-green-500"></span>
            <span className="inline-block w-2 h-2 rounded-sm bg-green-700 dark:bg-green-300"></span>
            More
          </div>
        </div>
      </div>
      
      {/* Badges section */}
      <div className="flex-1 space-y-3">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Your Achievements
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {badges.map((badge, index) => (
            <div 
              key={index} 
              className={`flex items-center p-2 rounded-md text-xs ${getBadgeColor(badge.level)}`}
            >
              <div className="mr-2">
                {badge.icon}
              </div>
              <div>
                <div className="font-medium">{badge.name}</div>
                <div className="opacity-80 text-xs">
                  {badge.level} ({badge.value} {badge.description})
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
} 