import { create } from 'zustand'
import type { IPlan } from '../../shared/types'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
  planId?: string
  threadId?: string
}

interface ChatState {
  messages: Message[]
  isProcessing: boolean
  activePlan: IPlan | null
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, content: string) => void
  completeMessage: (id: string) => void
  attachPlanToMessage: (messageId: string, planId: string) => void
  setActivePlan: (plan: IPlan | null) => void
  setProcessing: (processing: boolean) => void
  clearMessages: () => void
  loadHistory: (threadId: string, messages: Message[]) => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isProcessing: false,
  activePlan: null,

  addMessage: (message) => {
    const id = crypto.randomUUID()
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id,
          timestamp: new Date(),
        },
      ],
    }))
    return id
  },

  updateMessage: (id, content) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, content } : msg
      ),
    }))
  },

  completeMessage: (id) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, isStreaming: false } : msg
      ),
    }))
  },

  attachPlanToMessage: (messageId, planId) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, planId } : msg
      ),
    }))
  },

  setActivePlan: (plan) => {
    set({ activePlan: plan })
  },

  setProcessing: (processing) => {
    set({ isProcessing: processing })
  },

  clearMessages: () => {
    set({ messages: [], activePlan: null })
  },

  loadHistory: (_threadId, messages) => {
    set({ messages, isProcessing: false, activePlan: null })
  },
}))
