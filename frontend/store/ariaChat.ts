"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import type { ChatMessage } from "@/types";

interface StylistSession {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

interface AriaChatState {
  sessions: StylistSession[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  reset: () => void;
  loadSessions: () => Promise<void>;
  createSession: (messages?: ChatMessage[], title?: string) => Promise<string>;
  setCurrentSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSession: (messages: ChatMessage[], title?: string) => Promise<void>;
  newChat: () => Promise<void>;
}

export const useAriaChat = create<AriaChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      messages: [],
      loading: false,
      setMessages: (updater) =>
        set((s) => ({
          messages: typeof updater === "function" ? (updater as (p: ChatMessage[]) => ChatMessage[])(s.messages) : updater,
        })),
      reset: () => set({ messages: [], currentSessionId: null }),

      loadSessions: async () => {
        set({ loading: true });
        try {
          const res = await apiGet<{ sessions: StylistSession[] }>("/api/stylist/sessions");
          set({ sessions: res.sessions, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      createSession: async (messages = [], title) => {
        const res = await apiPost<StylistSession>("/api/stylist/sessions", { messages, title });
        set((s) => ({ sessions: [res, ...s.sessions], currentSessionId: res.id, messages: res.messages }));
        return res.id;
      },

      setCurrentSession: async (sessionId: string) => {
        const res = await apiGet<StylistSession>(`/api/stylist/sessions/${sessionId}`);
        set({ currentSessionId: sessionId, messages: res.messages });
      },

      deleteSession: async (sessionId: string) => {
        await apiDelete(`/api/stylist/sessions/${sessionId}`);
        set((s) => ({
          sessions: s.sessions.filter((ses) => ses.id !== sessionId),
          currentSessionId: s.currentSessionId === sessionId ? null : s.currentSessionId,
          messages: s.currentSessionId === sessionId ? [] : s.messages,
        }));
      },

      updateSession: async (messages: ChatMessage[], title?: string) => {
        const { currentSessionId } = get();
        if (!currentSessionId) return;
        await apiPut<StylistSession>(`/api/stylist/sessions/${currentSessionId}`, { messages, title });
        set((s) => ({
          sessions: s.sessions.map((ses) => (ses.id === currentSessionId ? { ...ses, messages, updated_at: new Date().toISOString() } : ses)),
          messages,
        }));
      },

      newChat: async () => {
        const res = await apiPost<StylistSession>("/api/stylist/sessions", { messages: [], title: "New chat" });
        set({ sessions: [res, ...get().sessions], currentSessionId: res.id, messages: [] });
      },
    }),
    {
      name: "stylesense-aria-chat",
      // Only persist UI state, not full sessions (those come from backend)
      partialize: (state) => ({
        currentSessionId: state.currentSessionId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.messages?.some((m) => m.manifesting)) {
          state.setMessages((prev) => prev.map((m) => (m.manifesting ? { ...m, manifesting: false } : m)));
        }
      },
    }
  )
);