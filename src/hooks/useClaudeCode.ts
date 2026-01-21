import { useEffect, useCallback, useRef } from 'react'
import { useChatStore } from '../stores/chatStore'

interface ClaudeOutputChunk {
  type: 'text' | 'error' | 'done' | 'start'
  content?: string
  error?: string
}

// Simple renderer-side logger (appears in DevTools console)
const log = {
  debug: (context: string, message: string, data?: unknown) => {
    console.log(`[DEBUG] [${context}] ${message}`, data ?? '')
  },
  info: (context: string, message: string, data?: unknown) => {
    console.log(`[INFO] [${context}] ${message}`, data ?? '')
  },
  warn: (context: string, message: string, data?: unknown) => {
    console.warn(`[WARN] [${context}] ${message}`, data ?? '')
  },
  error: (context: string, message: string, data?: unknown) => {
    console.error(`[ERROR] [${context}] ${message}`, data ?? '')
  },
}

export function useClaudeCode() {
  const addMessage = useChatStore((state) => state.addMessage)
  const updateMessage = useChatStore((state) => state.updateMessage)
  const completeMessage = useChatStore((state) => state.completeMessage)
  const setProcessing = useChatStore((state) => state.setProcessing)

  const currentMessageIdRef = useRef<string | null>(null)
  const accumulatedTextRef = useRef<string>('')

  useEffect(() => {
    if (!window.electronAPI?.claude) {
      log.warn('useClaudeCode', 'electronAPI.claude not available')
      return
    }

    log.info('useClaudeCode', 'Setting up claude output listener')

    const cleanup = window.electronAPI.claude.onOutput((chunk: ClaudeOutputChunk) => {
      log.debug('useClaudeCode', 'Received chunk', { type: chunk.type, hasContent: !!chunk.content, hasError: !!chunk.error })

      switch (chunk.type) {
        case 'start':
          log.info('useClaudeCode', 'Stream started, creating assistant message')
          // Create a new assistant message for streaming
          accumulatedTextRef.current = ''
          const messageId = addMessage({
            role: 'assistant',
            content: '',
            isStreaming: true,
          })
          currentMessageIdRef.current = messageId
          log.debug('useClaudeCode', 'Created message', { messageId })
          break

        case 'text':
          if (currentMessageIdRef.current && chunk.content) {
            accumulatedTextRef.current += chunk.content
            log.debug('useClaudeCode', 'Accumulated text', { totalLength: accumulatedTextRef.current.length, chunkLength: chunk.content.length })
            updateMessage(currentMessageIdRef.current, accumulatedTextRef.current)
          } else {
            log.warn('useClaudeCode', 'Received text but no message context', { hasMessageId: !!currentMessageIdRef.current, hasContent: !!chunk.content })
          }
          break

        case 'error':
          log.error('useClaudeCode', 'Received error chunk', { error: chunk.error })
          if (chunk.error) {
            if (currentMessageIdRef.current) {
              // Append error to current message
              accumulatedTextRef.current += `\n\n**Error:** ${chunk.error}`
              updateMessage(currentMessageIdRef.current, accumulatedTextRef.current)
            } else {
              // Create new error message
              addMessage({
                role: 'assistant',
                content: `**Error:** ${chunk.error}`,
              })
            }
          }
          break

        case 'done':
          log.info('useClaudeCode', 'Stream completed', { finalLength: accumulatedTextRef.current.length })
          if (currentMessageIdRef.current) {
            completeMessage(currentMessageIdRef.current)
            currentMessageIdRef.current = null
          }
          setProcessing(false)
          accumulatedTextRef.current = ''
          break

        default:
          log.warn('useClaudeCode', 'Unknown chunk type', { chunk })
      }
    })

    return cleanup
  }, [addMessage, updateMessage, completeMessage, setProcessing])

  const sendMessage = useCallback(async (content: string, workspaceConfig?: unknown) => {
    log.info('useClaudeCode', 'sendMessage called', { contentLength: content.length, hasWorkspaceConfig: !!workspaceConfig })

    if (!window.electronAPI?.claude) {
      log.warn('useClaudeCode', 'Claude API not available, using fallback')
      // Fallback to simulated response if Claude API not available
      addMessage({ role: 'user', content })
      setProcessing(true)

      setTimeout(() => {
        addMessage({
          role: 'assistant',
          content: 'Claude Code API is not available. Please ensure you are running in Electron with the Claude CLI installed.',
        })
        setProcessing(false)
      }, 500)
      return
    }

    // Add user message
    addMessage({ role: 'user', content })
    setProcessing(true)

    // Start Claude session
    try {
      log.info('useClaudeCode', 'Starting Claude session via IPC', { hasWorkspaceConfig: !!workspaceConfig })
      await window.electronAPI.claude.start(content, undefined, workspaceConfig)
      log.info('useClaudeCode', 'Claude session IPC call returned')
    } catch (error) {
      log.error('useClaudeCode', 'Failed to start Claude session', { error: error instanceof Error ? error.message : error })
      addMessage({
        role: 'assistant',
        content: `Failed to start Claude session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
      setProcessing(false)
    }
  }, [addMessage, setProcessing])

  const stopSession = useCallback(async () => {
    log.info('useClaudeCode', 'stopSession called')
    if (window.electronAPI?.claude) {
      await window.electronAPI.claude.stop()
      log.info('useClaudeCode', 'Stop session IPC call returned')
    }
    setProcessing(false)
  }, [setProcessing])

  return {
    sendMessage,
    stopSession,
  }
}
