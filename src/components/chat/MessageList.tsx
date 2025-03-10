import React from 'react';
import { Message } from '@/lib/db';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';

interface MessageListProps {
  messages: Message[];
  isGenerating?: boolean;
}

// Create a separate CodeBlock component to handle the tooltip state
const CodeBlock = ({ language, code }: { language: string; code: string }) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(code)
      .then(() => {
        setShowTooltip(true);
        setTimeout(() => {
          setShowTooltip(false);
        }, 2000); // Hide tooltip after 2 seconds
        console.log('Code copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy code: ', err);
      });
  };
  
  return (
    <div className="rounded-md overflow-hidden relative">
      <div className="relative">
        <button 
          onClick={copyToClipboard}
          className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white rounded p-1 text-xs z-10"
          aria-label="Copy code"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        {showTooltip && (
          <div className="absolute top-2 right-10 bg-gray-800 text-white text-xs rounded py-1 px-2 z-20">
            Copied!
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <Highlight
          theme={themes.dracula}
          code={code}
          language={language || 'text'}
        >
          {({className, style, tokens, getLineProps, getTokenProps}) => (
            <pre className={className} style={{...style, margin: 0, padding: '1rem'}}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({line})}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({token})} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
};

export default function MessageList({ messages, isGenerating = false }: MessageListProps) {
  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-4 py-2">
      {messages.map((message) => (
        <div key={message.id} className="message-container">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-semibold text-sm sm:text-base ${
              message.role === 'user' 
                ? 'text-blue-500' 
                : message.role === 'system'
                ? 'text-purple-500'
                : 'text-gray-700 dark:text-gray-300'
            }`}>
              {message.role === 'user'
                ? 'You'
                : message.role === 'system'
                ? 'System'
                : 'AI'}
            </span>
            <span className="text-[10px] sm:text-xs text-gray-500">
              {new Date(message.createdAt).toLocaleTimeString()}
            </span>
            {message.role === 'assistant' && message.price && (
              <div className="relative group ml-auto">
                <span className="text-[10px] sm:text-xs text-gray-500 cursor-help">
                  ${message.price.totalCost?.toFixed(6)} USD
                </span>
                <div className="absolute right-0 mt-1 w-60 bg-gray-800 text-white text-xs rounded py-2 px-3 z-10 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="font-semibold mb-1">Price Breakdown:</div>
                  <div className="grid grid-cols-2 gap-1">
                    <span>Prompt Tokens:</span>
                    <span className="text-right">{message.price.promptTokens?.toLocaleString()}</span>
                    <span>Prompt Cost:</span>
                    <span className="text-right">${message.price.promptCost?.toFixed(6)}</span>
                    
                    <span>Output Tokens:</span>
                    <span className="text-right">{message.price.completionTokens?.toLocaleString()}</span>
                    <span>Output Cost:</span>
                    <span className="text-right">${message.price.completionCost?.toFixed(6)}</span>
                    
                    {message.price.imageCount ? (
                      <>
                        <span>Images:</span>
                        <span className="text-right">{message.price.imageCount}</span>
                        <span>Image Cost:</span>
                        <span className="text-right">${message.price.imageCost?.toFixed(6)}</span>
                      </>
                    ) : null}
                    <span className="border-t border-gray-600 col-span-2 mt-1 pt-1"></span>
                    <span className="font-semibold">Total Cost:</span>
                    <span className="text-right font-semibold">${message.price.totalCost?.toFixed(6)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="prose dark:prose-invert max-w-none text-sm sm:text-base leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={(value: string) => value}
              components={{
                code: ({ className, children }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const language = match ? match[1] : '';
                  const isInline = !match && !className;
                  
                  return !isInline ? (
                    <CodeBlock 
                      language={language} 
                      code={String(children).replace(/\n$/, '')} 
                    />
                  ) : (
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm">
                      {children}
                    </code>
                  );
                },
                img: ({ src, alt, ...props }) => {
                  // Handle empty src attributes
                  if (!src || src === '') {
                    return null;
                  }
                  return <img style={{maxWidth: 160}} src={src} alt={alt || 'Image'} className="max-w-full rounded-lg my-2" {...props} />;
                },
                a: (props) => (
                  <a className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 break-words" {...props} />
                ),
                blockquote: (props) => (
                  <blockquote className="border-l-4 border-gray-200 dark:border-gray-700 pl-4 italic my-2" {...props} />
                ),
                ul: (props) => (
                  <ul className="list-disc list-inside space-y-1 my-2" {...props} />
                ),
                ol: (props) => (
                  <ol className="list-decimal list-inside space-y-1 my-2" {...props} />
                ),
                p: (props) => (
                  <p className="whitespace-pre-wrap break-words my-2" {...props} />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          <div className="border-b border-gray-200 dark:border-gray-700 mt-4"></div>
        </div>
      ))}
      
      {isGenerating && (
        <div className="message-container">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm sm:text-base text-gray-700 dark:text-gray-300">AI</span>
          </div>
          <div className="flex items-center">
            <div className="dot-typing"></div>
          </div>
        </div>
      )}
      
      <style jsx>{`
        .dot-typing {
          position: relative;
          left: -9999px;
          width: 8px;
          height: 8px;
          border-radius: 4px;
          background-color: #6b7280;
          color: #6b7280;
          box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          animation: dot-typing 1.5s infinite linear;
        }
        
        @keyframes dot-typing {
          0% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
          16.667% {
            box-shadow: 9984px -8px 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
          33.333% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
          50% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px -8px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
          66.667% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
          83.333% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px -8px 0 0 0 #6b7280;
          }
          100% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
        }
      `}</style>
    </div>
  );
} 