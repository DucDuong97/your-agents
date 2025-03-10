import React, { useState, useRef, useEffect } from 'react';
import { ModelInfo } from '@/lib/openrouter-client';

interface ModelSelectProps {
  models: ModelInfo[];
  value: string;
  onChange: (value: string) => void;
}

export default function ModelSelect({ models, value, onChange }: ModelSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedModel = models.find(model => model.id === value) || models[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Format context size to a readable format
  const formatContextSize = (size?: number) => {
    if (!size) return 'N/A';
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(0)}K`;
    return `${size}`;
  };

  // Format price to a readable format
  const formatPrice = (price?: number) => {
    if (price === undefined) return 'N/A';
    return `$${price.toFixed(2)}`;
  };

  // Render input modality icons
  const renderModalityIcons = (modalities?: string[]) => {
    if (!modalities) return null;
    
    return (
      <div className="flex space-x-1">
        {modalities.includes('text') && (
          <span title="Text" className="text-gray-600 dark:text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </span>
        )}
        {modalities.includes('images') && (
          <span title="Images" className="text-gray-600 dark:text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Selected model display */}
      <div 
        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white cursor-pointer flex items-center justify-between"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex flex-col">
          <div className="font-medium">{selectedModel.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-2">
            <span>Context: {formatContextSize(selectedModel.contextLength)}</span>
            <span>•</span>
            <span>Input: {formatPrice(selectedModel.pricing?.prompt)}/M</span>
            {renderModalityIcons(selectedModel.inputModalities)}
          </div>
        </div>
        <svg 
          className={`h-5 w-5 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown options */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {models.map(model => (
            <div 
              key={model.id}
              className={`p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${model.id === value ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
              onClick={() => {
                onChange(model.id);
                setIsOpen(false);
              }}
            >
              <div className="font-medium">{model.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2">
                <span>Context: {formatContextSize(model.contextLength)}</span>
                <span>•</span>
                <span>Input: {formatPrice(model.pricing?.prompt)}/M</span>
                <span>•</span>
                <span>Output: {formatPrice(model.pricing?.completion)}/M</span>
                <div className="ml-auto">{renderModalityIcons(model.inputModalities)}</div>
              </div>
              {model.description && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {model.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 