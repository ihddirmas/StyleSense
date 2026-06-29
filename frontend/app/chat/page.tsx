"use client";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, MessagesSquare, Loader2, Sparkles, Image as ImageIcon, Layers, Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/components/AuthProvider";
import { apiGet, apiPost } from "@/lib/api";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/Toast";
import { TryOnDetailModal } from "@/components/TryOnDetailModal";
import { OutfitDetailModal } from "@/components/OutfitDetailModal";
import type { TryOnResult, Outfit } from "@/types";

interface ProfileMin {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  share_code: string | null;
}

interface MessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string | null;
  shared_outfit_id: string | null;
  shared_tryon_id: string | null;
  shared_image_url: string | null;
  shared_caption: string | null;
  read_at: string | null;
  created_at: string;
  outfit?: { id: string; name: string; preview_image_url: string | null; item_ids: string[] } | null;
  tryon?: { id: string; result_image_url: string; result_video_url: string | null } | null;
}

interface ThreadRow {
  other: ProfileMin;
  last_message: MessageRow;
  unread: number;
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatInner />
    </Suspense>
  );
}

function ChatInner() {
  const { user } = useAuth();
  const search = useSearchParams();
  const router = useRouter();
  const initialOther = search.get("with");

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeOther, setActiveOther] = useState<string | null>(initialOther);
  const supabase = getSupabaseBrowser();

  const loadThreads = useCallback(async () => {
    try {
      const data = await apiGet<ThreadRow[]>("/api/chat/threads");
      setThreads(data);
    } catch (e) {
      toast.error(`Failed to load chats: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadThreads();

    // Realtime: refresh threads when any new message arrives
    const channel = supabase
      .channel(`threads:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages",
          filter: `recipient_id=eq.${user.id}` },
        () => loadThreads()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, supabase, loadThreads]);

  useEffect(() => { setActiveOther(initialOther); }, [initialOther]);

  function selectThread(otherId: string) {
    setActiveOther(otherId);
    router.replace(`/chat?with=${otherId}`);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0">
        <PageHeader
          eyebrow="Direct messages"
          tutorialKey="chat"
          subtitle="Talk to your friends. Share outfits and try-ons. Get a second opinion."
        />
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        {/* LEFT: thread list */}
        <div className="col-span-4 surface flex flex-col min-h-0">
          <div className="px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
              Your conversations
            </div>
            <div className="font-display text-xl">All chats</div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {threads.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                <Users size={24} className="mx-auto mb-2" style={{ color: "var(--text-dim)" }} />
                No chats yet. <Link href="/friends" style={{ color: "var(--gold)" }}>Add a friend</Link> to start.
              </div>
            ) : (
              threads.map((t) => (
                <ThreadCard
                  key={t.other.id}
                  thread={t}
                  active={t.other.id === activeOther}
                  onClick={() => selectThread(t.other.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT: active chat */}
        <div className="col-span-8 surface flex flex-col min-h-0">
          {activeOther ? (
            <ChatThread otherId={activeOther} onMessageSent={loadThreads} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--text-muted)" }}>
              <div className="text-center">
                <MessagesSquare size={32} className="mx-auto mb-2" style={{ color: "var(--text-dim)" }} />
                Pick a chat from the left, or <Link href="/friends" style={{ color: "var(--gold)" }}>find a friend</Link>.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadCard({ thread, active, onClick }: { thread: ThreadRow; active: boolean; onClick: () => void }) {
  const lastText =
    thread.last_message.content ||
    (thread.last_message.shared_outfit_id ? "Shared an outfit" :
     thread.last_message.shared_tryon_id ? "Shared a try-on" :
     thread.last_message.shared_image_url ? "Shared an image" : "");
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 flex items-center gap-3 text-left transition"
      style={{
        background: active ? "var(--gold-dim)" : "transparent",
        border: "none", borderBottom: "1px solid var(--border)",
        cursor: "pointer", color: "var(--text)",
      }}
    >
      <Avatar name={thread.other.full_name || thread.other.email || "?"} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {thread.other.full_name || thread.other.email}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
          {lastText}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1" style={{ flexShrink: 0 }}>
        <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
          {timeShort(thread.last_message.created_at)}
        </div>
        {thread.unread > 0 && (
          <span
            className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center"
            style={{ background: "var(--gold)", color: "var(--on-gold)" }}
          >
            {thread.unread}
          </span>
        )}
      </div>
    </button>
  );
}

function ChatThread({ otherId, onMessageSent }: { otherId: string; onMessageSent: () => void }) {
  const { user } = useAuth();
  const supabase = getSupabaseBrowser();
  const [other, setOther] = useState<ProfileMin | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [openTryOn, setOpenTryOn] = useState<TryOnResult | null>(null);
  const [openOutfit, setOpenOutfit] = useState<Outfit | null>(null);
  const [openImage, setOpenImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchThread = useCallback(async () => {
    try {
      const data = await apiGet<{ messages: MessageRow[]; other: ProfileMin }>(`/api/chat/with/${otherId}`);
      setMessages(data.messages);
      setOther(data.other);
    } catch (e) {
      toast.error(`Failed to open chat: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }, [otherId]);

  useEffect(() => { fetchThread(); }, [fetchThread]);

  // Realtime subscribe to messages between me and other
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`chat:${user.id}:${otherId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload: { new: MessageRow }) => {
          const m = payload.new as MessageRow;
          // Filter to only our pair
          const ourPair =
            (m.sender_id === user.id && m.recipient_id === otherId) ||
            (m.sender_id === otherId && m.recipient_id === user.id);
          if (!ourPair) return;
          // If it has attachments we need to refetch to hydrate; otherwise just append
          if (m.shared_outfit_id || m.shared_tryon_id) {
            fetchThread();
          } else {
            setMessages((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, m]);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, otherId, supabase, fetchThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await apiPost("/api/chat/send", { recipient_id: otherId, content: text.trim() });
      setText("");
      onMessageSent();
    } catch (e) {
      toast.error(`Send failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <Avatar name={other?.full_name || other?.email || "?"} />
        <div className="flex-1">
          <div className="font-display text-xl">{other?.full_name || other?.email || "..."}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{other?.email}</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-5 space-y-3">
        <AnimatePresence>
          {messages.map((m) => (
            <Bubble
              key={m.id}
              m={m}
              mine={m.sender_id === user?.id}
              onOpenTryOn={(t) => setOpenTryOn(t as TryOnResult)}
              onOpenOutfit={(o) => setOpenOutfit(o as Outfit)}
              onOpenImage={(url) => setOpenImage(url)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Detail modals for shared cards */}
      <AnimatePresence>
        {openTryOn && (
          <TryOnDetailModal
            result={openTryOn}
            onClose={() => setOpenTryOn(null)}
            sharedBy={other ? { name: other.full_name, email: other.email } : null}
          />
        )}
        {openOutfit && (
          <OutfitDetailModal outfit={openOutfit} onClose={() => setOpenOutfit(null)} />
        )}
        {openImage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center px-4 py-8"
            style={{ background: "rgba(8,8,13,0.95)", zIndex: 100 }}
            onClick={() => setOpenImage(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={openImage} alt="Shared" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
        {showShare && (
          <ShareTray otherId={otherId} onShared={() => { setShowShare(false); fetchThread(); onMessageSent(); }} />
        )}
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => setShowShare((v) => !v)}
            style={{ padding: "0.6rem 0.9rem" }}
            title="Share an outfit or try-on"
          >
            <Sparkles size={14} />
          </button>
          <input
            className="input"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            disabled={sending}
          />
          <button className="btn-primary" onClick={send} disabled={!text.trim() || sending}>
            {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </>
  );
}

function Bubble({ m, mine, onOpenTryOn, onOpenOutfit, onOpenImage }: {
  m: MessageRow; mine: boolean;
  onOpenTryOn: (t: NonNullable<MessageRow["tryon"]>) => void;
  onOpenOutfit: (o: NonNullable<MessageRow["outfit"]>) => void;
  onOpenImage: (url: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`flex ${mine ? "justify-end" : "justify-start"}`}
    >
      <div
        className="max-w-[75%] rounded-[14px] px-4 py-2.5"
        style={{
          background: mine ? "var(--gold-dim)" : "var(--surface2)",
          border: mine ? "1px solid var(--border-gold)" : "1px solid var(--border)",
          color: "var(--text)",
        }}
      >
        {/* Attached outfit - click to open */}
        {m.outfit && (
          <button
            onClick={() => onOpenOutfit(m.outfit!)}
            className="mb-2 surface overflow-hidden block group transition"
            style={{ maxWidth: 220, padding: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}
          >
            {m.outfit.preview_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.outfit.preview_image_url} alt={m.outfit.name} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover" }} />
            )}
            <div className="px-3 py-2 flex items-center gap-2 text-xs">
              <Layers size={12} style={{ color: "var(--gold)" }} />
              <span style={{ color: "var(--text)" }}>{m.outfit.name}</span>
              <span className="ml-auto opacity-0 group-hover:opacity-100 transition" style={{ color: "var(--gold)" }}>View →</span>
            </div>
          </button>
        )}
        {/* Attached try-on - click to open */}
        {m.tryon && (
          <button
            onClick={() => onOpenTryOn(m.tryon!)}
            className="mb-2 surface overflow-hidden block group transition"
            style={{ maxWidth: 220, padding: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}
          >
            {m.tryon.result_video_url ? (
              <video src={m.tryon.result_video_url} style={{ width: "100%", aspectRatio: "3/4", pointerEvents: "none" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.tryon.result_image_url} alt="Try-on" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover" }} />
            )}
            <div className="px-3 py-2 flex items-center gap-2 text-xs">
              <Sparkles size={12} style={{ color: "var(--gold)" }} />
              <span style={{ color: "var(--text)" }}>Try-on</span>
              <span className="ml-auto opacity-0 group-hover:opacity-100 transition" style={{ color: "var(--gold)" }}>View →</span>
            </div>
          </button>
        )}
        {/* Direct image attachment - click to open lightbox */}
        {m.shared_image_url && !m.tryon && !m.outfit && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.shared_image_url}
            alt="Shared"
            className="mb-2 rounded-md cursor-pointer"
            style={{ maxWidth: 220 }}
            onClick={() => onOpenImage(m.shared_image_url!)}
          />
        )}
        {m.shared_caption && <div className="text-xs italic mb-1" style={{ color: "var(--text-muted)" }}>{m.shared_caption}</div>}
        {m.content && <div className="text-sm whitespace-pre-wrap">{m.content}</div>}
        <div className="text-[10px] mt-1 text-right" style={{ color: "var(--text-dim)" }}>
          {timeShort(m.created_at)}
        </div>
      </div>
    </motion.div>
  );
}

function ShareTray({ otherId, onShared }: { otherId: string; onShared: () => void }) {
  const [tab, setTab] = useState<"outfits" | "tryons">("outfits");
  const [outfits, setOutfits] = useState<{ id: string; name: string; preview_image_url: string | null }[]>([]);
  const [tryons, setTryons] = useState<{ id: string; result_image_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<typeof outfits>("/api/outfits").catch(() => []),
      apiGet<typeof tryons>("/api/tryon/recent?limit=12").catch(() => []),
    ]).then(([o, t]) => {
      setOutfits(o);
      setTryons(t);
      setLoading(false);
    });
  }, []);

  async function shareOutfit(id: string) {
    setSharing(id);
    try {
      await apiPost("/api/chat/send", { recipient_id: otherId, shared_outfit_id: id });
      toast.success("Outfit shared.");
      onShared();
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSharing(null);
    }
  }
  async function shareTryon(id: string) {
    setSharing(id);
    try {
      await apiPost("/api/chat/send", { recipient_id: otherId, shared_tryon_id: id });
      toast.success("Try-on shared.");
      onShared();
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSharing(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="surface p-3 mb-3"
    >
      <div className="flex gap-2 mb-3">
        <button className={`chip ${tab === "outfits" ? "chip-active" : ""}`} onClick={() => setTab("outfits")}>
          <Layers size={11} style={{ marginRight: 4 }} /> Outfits ({outfits.length})
        </button>
        <button className={`chip ${tab === "tryons" ? "chip-active" : ""}`} onClick={() => setTab("tryons")}>
          <ImageIcon size={11} style={{ marginRight: 4 }} /> Try-ons ({tryons.length})
        </button>
      </div>
      {loading ? (
        <div className="text-center text-xs py-3" style={{ color: "var(--text-muted)" }}>Loading...</div>
      ) : tab === "outfits" ? (
        outfits.length === 0 ? (
          <p className="text-xs text-center py-3" style={{ color: "var(--text-muted)" }}>No saved outfits yet.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {outfits.map((o) => (
              <button key={o.id} onClick={() => shareOutfit(o.id)} disabled={sharing === o.id}
                      className="surface overflow-hidden flex-shrink-0" style={{ width: 80, padding: 0, cursor: "pointer" }}>
                {o.preview_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.preview_image_url} alt={o.name} style={{ width: 80, height: 100, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 80, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Layers size={20} style={{ color: "var(--text-dim)" }} />
                  </div>
                )}
                <div className="text-[10px] truncate px-1 py-1" style={{ color: "var(--text)" }}>{o.name}</div>
              </button>
            ))}
          </div>
        )
      ) : tryons.length === 0 ? (
        <p className="text-xs text-center py-3" style={{ color: "var(--text-muted)" }}>No try-ons yet.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tryons.map((t) => (
            <button key={t.id} onClick={() => shareTryon(t.id)} disabled={sharing === t.id}
                    className="surface overflow-hidden flex-shrink-0" style={{ width: 80, padding: 0, cursor: "pointer" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.result_image_url} alt="Try-on" style={{ width: 80, height: 100, objectFit: "cover" }} />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-sm"
      style={{
        width: 38, height: 38,
        background: "var(--gold-dim)",
        color: "var(--gold)",
        border: "1px solid var(--border-gold)",
        flexShrink: 0,
      }}
    >
      {(name[0] || "?").toUpperCase()}
    </div>
  );
}

function timeShort(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
