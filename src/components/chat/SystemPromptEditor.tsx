import React, { useState, useEffect, useRef } from 'react';

interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

export default function SystemPromptEditor({ value, onChange, onClose }: SystemPromptEditorProps) {
  const [promptText, setPromptText] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [lineCount, setLineCount] = useState(1);

  // Update local state when the external value changes
  useEffect(() => {
    setPromptText(value);
    updateLineCount(value);
  }, [value]);

  // Update line count when text changes
  const updateLineCount = (text: string) => {
    const lines = text.split('\n').length;
    setLineCount(lines);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setPromptText(newText);
    updateLineCount(newText);
  };

  const handleSave = () => {
    onChange(promptText);
    onClose();
  };

  // Handle tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      
      // Insert tab at cursor position
      const newText = promptText.substring(0, start) + '  ' + promptText.substring(end);
      setPromptText(newText);
      
      // Move cursor after the inserted tab
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
      
      updateLineCount(newText);
    }
  };

  // Sync scroll between textarea and line numbers
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Generate line numbers
  const renderLineNumbers = () => {
    return Array.from({ length: lineCount }, (_, i) => i + 1).map(num => (
      <div key={num} className="text-right pr-2 text-gray-400 select-none">
        {num}
      </div>
    ));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Edit System Prompt
          </h2>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md"
            >
              Save Changes
            </button>
          </div>
        </div>
        
        <div className="p-4 flex-grow overflow-hidden">
          <div className="h-full flex flex-col">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              This prompt defines the agent&apos;s personality and capabilities. Use this editor for more comfortable editing of large prompts.
            </p>
            
            <div className="flex-grow border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden flex flex-col">
              {/* Editor toolbar */}
              <div className="bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600 px-3 py-1 flex items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  System Prompt Editor
                </span>
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                  {promptText.length} characters | {lineCount} lines
                </span>
              </div>
              
              {/* Editor content */}
              <div className="flex-grow flex overflow-hidden">
                {/* Line numbers */}
                <div className="bg-gray-50 dark:bg-gray-800 py-2 overflow-y-hidden flex-shrink-0 w-12">
                  <div ref={lineNumbersRef} className="h-full overflow-y-hidden">
                    {renderLineNumbers()}
                  </div>
                </div>
                
                {/* Text area */}
                <textarea
                  ref={textareaRef}
                  value={promptText}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  onScroll={handleScroll}
                  className="flex-grow p-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none outline-none border-none overflow-y-auto"
                  placeholder="You are a helpful assistant."
                  spellCheck={false}
                  wrap="off"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 