"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import type { ChatMessage } from "@/types";

interface StylistSession {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

function chatStorageKey(): string {
  if (typeof window === "undefined") return "stylesense-aria-chat";
  const uid = window.localStorage.getItem("stylesense-last-user");
  return uid ? `stylesense-aria-chat-${uid}` : "stylesense-aria-chat";
}

function sanitizeForPersist(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    photoUrl: m.photoUrl?.startsWith("data:") ? undefined : m.photoUrl,
    manifesting: false,
    pendingAction:
      m.pendingAction?.status === "pending" ? undefined : m.pendingAction,
  }));
}

interface AriaChatState {
  hydrated: boolean;
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
      hydrated: false,
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
          sessions: s.sessions.map((ses) =>
            ses.id === currentSessionId
              ? { ...ses, messages, updated_at: new Date().toISOString(), ...(title ? { title } : {}) }
              : ses
          ),
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
      storage: createJSONStorage(() => ({
        getItem: (name) => localStorage.getItem(chatStorageKey()),
        setItem: (_name, value) => localStorage.setItem(chatStorageKey(), value),
        removeItem: (_name) => localStorage.removeItem(chatStorageKey()),
      })),
      skipHydration: true,
      partialize: (state) => ({
        currentSessionId: state.currentSessionId,
        messages: sanitizeForPersist(state.messages),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.messages.some((m) => m.manifesting)) {
          state.setMessages((prev) => prev.map((m) => (m.manifesting ? { ...m, manifesting: false } : m)));
        }
      },
    }
  )
);

export async function finishAriaChatHydration() {
  const { currentSessionId, messages, setCurrentSession } = useAriaChat.getState();
  if (currentSessionId && messages.length === 0) {
    try {
      await setCurrentSession(currentSessionId);
    } catch {
      /* server session may be gone; user can start fresh */
    }
  }
  useAriaChat.setState({ hydrated: true });
}
