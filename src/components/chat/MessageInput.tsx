import React from 'react';
import { UseFormRegister } from 'react-hook-form';

interface MessageInputProps {
  onSubmit: (e: React.FormEvent) => void;
  register: UseFormRegister<{ message: string }>;
  isSubmitting: boolean;
}

export default function MessageInput({
  onSubmit,
  register,
  isSubmitting,
}: MessageInputProps) {
  // Get the register result to access the onChange handler
  const messageRegister = register('message', { required: true });
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (!e.metaKey) {
        if (!isSubmitting) {
          onSubmit(e);
        }
      }
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <div className="flex-1">
        <textarea
          {...messageRegister}
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none text-base sm:text-sm"
          placeholder="Type your message..."
          rows={1}
          style={{ minHeight: '44px', maxHeight: '160px' }}
          disabled={isSubmitting}
          onKeyDown={handleKeyDown}
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed min-w-[72px] h-[44px] touch-manipulation flex items-center justify-center"
      >
        {isSubmitting ? (
          <span className="flex items-center">
            <svg
              className="animate-spin h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </span>
        ) : (
          'Send'
        )}
      </button>
    </form>
  );
} 