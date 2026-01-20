import { useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'
import { MessageBubble } from './MessageBubble'

export function MessageList() {
  const messages = useChatStore((state) => state.messages)
  const isProcessing = useChatStore((state) => state.isProcessing)
  const containerRef = useRef<HTMLDivElement>(null)

  // Get the content of the last message for scroll tracking during streaming
  const lastMessageContent = messages[messages.length - 1]?.content

  // Auto-scroll to bottom when messages change or content streams in
  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [messages.length, lastMessageContent])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <h2 className="text-2xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-3">
            What would you like to build?
          </h2>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Describe a feature or paste a JIRA ticket number to get started. I'll help you create a spawnee plan.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Typing indicator when processing */}
        {isProcessing && !messages.some(m => m.isStreaming) && (
          <div className="flex justify-start">
            <div className="bg-light-surface dark:bg-dark-surface px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-light-text-secondary dark:bg-dark-text-secondary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-light-text-secondary dark:bg-dark-text-secondary animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-light-text-secondary dark:bg-dark-text-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div />
      </div>
    </div>
  )
}
