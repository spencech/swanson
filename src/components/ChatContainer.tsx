import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { useClaudeCode } from '../hooks/useClaudeCode'
import { useChatStore } from '../stores/chatStore'

interface WorkspaceConfig {
  checkedOutRepos: Array<{ name: string; path: string; description?: string }>
  metadataOnlyRepos: Array<{ name: string; description: string }>
  isUnsure: boolean
}

interface ChatContainerProps {
  workspaceConfig?: WorkspaceConfig | null
}

export function ChatContainer({ workspaceConfig }: ChatContainerProps) {
  const { sendMessage, stopSession } = useClaudeCode()
  const isProcessing = useChatStore((state) => state.isProcessing)

  const handleSend = async (content: string) => {
    await sendMessage(content, workspaceConfig)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <MessageList />
      <ChatInput onSend={handleSend} />

      {/* Stop button when processing */}
      {isProcessing && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
          <button
            onClick={stopSession}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium shadow-lg transition-colors"
          >
            Stop Generation
          </button>
        </div>
      )}
    </div>
  )
}
