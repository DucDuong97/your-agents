import React, { useState, useRef } from 'react';
import { UseFormRegister, UseFormSetValue } from 'react-hook-form';
import Image from 'next/image';

interface MessageInputProps {
  onSubmit: (e: React.FormEvent) => void;
  register: UseFormRegister<{ message: string; image?: File }>;
  setValue: UseFormSetValue<{ message: string; image?: File }>;
  isSubmitting: boolean;
  supportsImages?: boolean;
}

export default function MessageInput({
  onSubmit,
  register,
  setValue,
  isSubmitting,
  supportsImages = false,
}: MessageInputProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Get the register result to access the onChange handler
  const messageRegister = register('message', { required: true });
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // Allow line break with Shift + Enter or Cmd + Enter
      if (e.shiftKey || e.metaKey) {
        return; // Allow default behavior (line break)
      }
      // Submit on Enter alone
      if (!isSubmitting) {
        e.preventDefault();
        onSubmit(e);
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Set the file in the form
      setValue('image', file);
      
      // Create a preview URL
      const imageUrl = URL.createObjectURL(file);
      setSelectedImage(imageUrl);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setValue('image', undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {selectedImage && (
        <div className="relative w-32 h-32 mb-2">
          <Image 
            src={selectedImage} 
            alt="Selected image" 
            fill
            className="object-contain rounded-lg"
          />
          <button
            type="button"
            onClick={handleRemoveImage}
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <textarea
            {...messageRegister}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none text-base sm:text-sm"
            placeholder="Type your message..."
            rows={2}
            style={{ minHeight: '44px', maxHeight: '160px' }}
            disabled={isSubmitting}
            onKeyDown={handleKeyDown}
          />
        </div>
        
        {supportsImages && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            className="px-3 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed h-[44px] touch-manipulation flex items-center justify-center"
            aria-label="Upload image"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              disabled={isSubmitting}
              onChange={handleImageUpload}
            />
          </button>
        )}
        
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
      </div>
    </form>
  );
} 