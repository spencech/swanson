import { useEffect, useCallback, useRef, useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { usePlanStore } from '../stores/planStore'
import type { IWSMessage, IChatPayload, IStatusPayload, IErrorPayload, IPlanUpdatePayload, IPlanApprovedPayload, IPlanYamlPayload } from '../../shared/types'

type ConnectionState = 'disconnected' | 'connected' | 'reconnecting'

export function useOpenClaw() {
  const addMessage = useChatStore((state) => state.addMessage)
  const updateMessage = useChatStore((state) => state.updateMessage)
  const completeMessage = useChatStore((state) => state.completeMessage)
  const setProcessing = useChatStore((state) => state.setProcessing)
  const setCurrentPlan = usePlanStore((state) => state.setCurrentPlan)
  const updatePlanStatus = usePlanStore((state) => state.updatePlanStatus)

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const currentMessageIdRef = useRef<string | null>(null)
  const accumulatedTextRef = useRef<string>('')

  // Listen for OpenClaw messages from main process
  useEffect(() => {
    if (!window.electronAPI?.openclaw) return

    const cleanup = window.electronAPI.openclaw.onMessage((raw: unknown) => {
      const msg = raw as IWSMessage
      if (!msg || !msg.type) return

      switch (msg.type) {
        case 'chat': {
          const payload = msg.payload as IChatPayload

          if (payload.done) {
            // Stream complete
            if (currentMessageIdRef.current) {
              completeMessage(currentMessageIdRef.current)
              currentMessageIdRef.current = null
            }
            setProcessing(false)
            accumulatedTextRef.current = ''
          } else if (payload.delta) {
            // Streaming delta
            if (!currentMessageIdRef.current) {
              // First delta — create message
              accumulatedTextRef.current = payload.content
              const messageId = addMessage({
                role: 'assistant',
                content: payload.content,
                isStreaming: true,
              })
              currentMessageIdRef.current = messageId
            } else {
              accumulatedTextRef.current += payload.content
              updateMessage(currentMessageIdRef.current, accumulatedTextRef.current)
            }
          } else if (!payload.delta && !payload.done && payload.messageId) {
            // Start indicator — create empty streaming message
            accumulatedTextRef.current = ''
            const messageId = addMessage({
              role: 'assistant',
              content: '',
              isStreaming: true,
            })
            currentMessageIdRef.current = messageId
          }
          break
        }

        case 'status': {
          const payload = msg.payload as IStatusPayload
          setConnectionState(payload.state as ConnectionState)
          if (payload.state === 'disconnected') {
            setConnectionError(payload.message || null)
          } else {
            setConnectionError(null)
          }
          break
        }

        case 'error': {
          const payload = msg.payload as IErrorPayload
          // If we're in a streaming message, append error
          if (currentMessageIdRef.current) {
            accumulatedTextRef.current += `\n\n**Error:** ${payload.message}`
            updateMessage(currentMessageIdRef.current, accumulatedTextRef.current)
            completeMessage(currentMessageIdRef.current)
            currentMessageIdRef.current = null
          } else {
            addMessage({
              role: 'assistant',
              content: `**Error:** ${payload.message}`,
            })
          }
          setProcessing(false)
          break
        }

        case 'plan:update': {
          const payload = msg.payload as IPlanUpdatePayload
          setCurrentPlan(payload.plan)
          break
        }

        case 'plan:approved': {
          const payload = msg.payload as IPlanApprovedPayload
          updatePlanStatus(payload.status)
          break
        }

        case 'plan:yaml': {
          const payload = msg.payload as IPlanYamlPayload
          const blob = new Blob([payload.yaml], { type: 'text/yaml' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = payload.filename
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          break
        }
      }
    })

    return cleanup
  }, [addMessage, updateMessage, completeMessage, setProcessing, setCurrentPlan, updatePlanStatus])

  // Connect to OpenClaw on mount
  useEffect(() => {
    if (!window.electronAPI?.openclaw) return

    const doConnect = async () => {
      const result = await window.electronAPI.openclaw.connect()
      if (result.success) {
        setConnectionState('connected')
        setConnectionError(null)
      } else {
        setConnectionState('disconnected')
        setConnectionError(result.error || 'Failed to connect')
      }
    }

    doConnect()

    return () => {
      window.electronAPI?.openclaw?.disconnect()
    }
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    if (!window.electronAPI?.openclaw) {
      addMessage({ role: 'user', content })
      addMessage({
        role: 'assistant',
        content: 'OpenClaw API is not available. Check your server connection.',
      })
      return
    }

    addMessage({ role: 'user', content })
    setProcessing(true)

    try {
      await window.electronAPI.openclaw.send(content)
    } catch (error) {
      addMessage({
        role: 'assistant',
        content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
      setProcessing(false)
    }
  }, [addMessage, setProcessing])

  const stopSession = useCallback(async () => {
    if (window.electronAPI?.openclaw) {
      await window.electronAPI.openclaw.stop()
    }
    if (currentMessageIdRef.current) {
      completeMessage(currentMessageIdRef.current)
      currentMessageIdRef.current = null
    }
    setProcessing(false)
  }, [completeMessage, setProcessing])

  return {
    sendMessage,
    stopSession,
    connectionState,
    connectionError,
  }
}
