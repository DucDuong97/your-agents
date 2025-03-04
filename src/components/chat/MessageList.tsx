import React from 'react';
import { Message } from '@/lib/db';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, themes } from 'prism-react-renderer';

interface MessageListProps {
  messages: Message[];
  isGenerating?: boolean;
}

export default function MessageList({ messages, isGenerating = false }: MessageListProps) {
  return (
    <div className="space-y-6 px-4 py-2">
      {messages.map((message) => (
        <div key={message.id} className="message-container">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-semibold ${
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
            <span className="text-xs text-gray-500">
              {new Date(message.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const language = match ? match[1] : '';
                  const isInline = !match && !className;
                  
                  return !isInline ? (
                    <div className="rounded-md overflow-hidden">
                      <Highlight
                        theme={themes.dracula}
                        code={String(children).replace(/\n$/, '')}
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
                  ) : (
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded" {...props}>
                      {children}
                    </code>
                  );
                },
                a: (props) => (
                  <a className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300" {...props} />
                ),
                blockquote: (props) => (
                  <blockquote className="border-l-4 border-gray-200 dark:border-gray-700 pl-4 italic" {...props} />
                ),
                ul: (props) => (
                  <ul className="list-disc list-inside" {...props} />
                ),
                ol: (props) => (
                  <ol className="list-decimal list-inside" {...props} />
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
            <span className="font-semibold text-gray-700 dark:text-gray-300">AI</span>
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
          width: 10px;
          height: 10px;
          border-radius: 5px;
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
            box-shadow: 9984px -10px 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
          33.333% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
          50% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px -10px 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
          66.667% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
          83.333% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px -10px 0 0 #6b7280;
          }
          100% {
            box-shadow: 9984px 0 0 0 #6b7280, 9999px 0 0 0 #6b7280, 10014px 0 0 0 #6b7280;
          }
        }
      `}</style>
    </div>
  );
} 