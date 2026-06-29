"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, Sparkles, MessageCircle, Mic, ChevronRight,
  Camera, X, Shuffle, Wand2, Plus, Bookmark, Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAppStore } from "@/store/app";
import { useAriaChat } from "@/store/ariaChat";
import { useAuth } from "@/components/AuthProvider";
import { apiGet, apiPost } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import type { ChatMessage, WardrobeItem } from "@/types";
import { AvatarWidget } from "@/components/stylist/AvatarWidget";

const SUGGESTION_PROMPTS = [
  "Dinner date that says 'I have taste'",
  "Main character energy for brunch",
  "Boardroom but make it fashion",
  "What goes well with my white t-shirt?",
  "Beach-day outfit from what I own",
];

export default function StylistPage() {
  const { user, profile } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0];
  const [tab, setTab] = useState<"chat" | "this-or-that" | "voice">("chat");
  const { messages, setMessages, reset } = useAriaChat();
  const greeting = (): ChatMessage => ({
    role: "assistant",
    content: firstName
      ? `Hey ${firstName}, I've studied every piece in your closet. What vibe are we creating today?`
      : "Hey — I've studied every piece in your closet. What vibe are we creating today?",
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messages.length === 0) setMessages([greeting()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, firstName]);

  function startNewChat() {
    reset();
    setMessages([greeting()]);
  }

  useEffect(() => {
    if (!user) return;
    apiGet<WardrobeItem[]>(`/api/wardrobe`).then(setItems).catch(() => {});
    Promise.all([
      apiGet<{ selfie_urls: string[]; primary_url: string | null }>("/api/avatar/selfies").catch(() => null),
      apiGet<{ full_body_url: string | null }>("/api/avatar/full-body").catch(() => null),
    ]).then(([s, b]) => {
      setSelfieUrl(s?.primary_url || s?.selfie_urls?.[0] || b?.full_body_url || null);
    });
  }, [user]);

  async function manifestLook(idx: number) {
    const msg = messages[idx];
    const picked = items.filter((it) => (msg.suggestedItemIds || []).includes(it.id));
    if (picked.length === 0) return;
    if (!selfieUrl) { toast.error("Add a selfie in Avatar Setup first."); return; }
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, manifesting: true } : m)));
    try {
      const res = await apiPost<{ result_image_url: string; result_id: string }>("/api/tryon/generate-multi", {
        avatar_selfie_url: selfieUrl,
        items: picked.map((it) => ({ image_url: it.image_url, name: it.name, category: it.category })),
        model: useAppStore.getState().tryonModel,
        setting: msg.scene || undefined,
        enhance_prompt: true,
      });
      setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, manifesting: false, manifestUrl: res.result_image_url, manifestId: res.result_id } : m)));
    } catch (e) {
      setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, manifesting: false } : m)));
      toast.error(`Manifest failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  // Save a manifested chat look to the Outfits section.
  async function saveManifestOutfit(idx: number) {
    const msg = messages[idx];
    const picked = items.filter((it) => (msg.suggestedItemIds || []).includes(it.id));
    if (!msg.manifestUrl || picked.length === 0) return;
    try {
      await apiPost("/api/outfits/save", {
        name: picked.map((it) => it.name).join(" + ").slice(0, 60) || "Aria's look",
        item_ids: picked.map((it) => it.id),
        preview_image_url: msg.manifestUrl,
        tryon_result_id: msg.manifestId,
        notes: "Saved from Aria chat",
      });
      setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, savedOutfit: true } : m)));
      toast.success("Saved to your Outfits.");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function send(text: string) {
    const hasContent = text.trim() || photoPreview;
    if (!hasContent || loading) return;

    let content = text.trim();
    if (photoPreview && !content) content = "What do you think of this?";
    else if (photoPreview) content = `${content}`;

    const userMsg: ChatMessage = {
      role: "user",
      content,
      photoUrl: photoPreview || undefined,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setPhotoPreview(null);
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        messages: next.map((m) => ({
          role: m.role,
          content: m.photoUrl ? `[Photo shared] ${m.content}` : m.content,
        })),
      };
      if (photoPreview) payload.image_url = photoPreview;

      const res = await apiPost<{ reply: string; suggested_item_ids: string[]; scene?: string | null }>(
        "/api/stylist/chat",
        payload
      );
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: res.reply,
        suggestedItemIds: res.suggested_item_ids,
        scene: res.scene,
      }]);
    } catch (e) {
      toast.error(`Stylist failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0">
        <PageHeader
          tutorialKey="stylist"
          subtitle="Ask anything — I know your full wardrobe and pick specific items."
        />

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button
            className={`chip ${tab === "chat" ? "chip-active" : ""}`}
            onClick={() => setTab("chat")}
          >
            <MessageCircle size={12} style={{ marginRight: 6 }} /> Text chat
          </button>
          <button
            className={`chip ${tab === "this-or-that" ? "chip-active" : ""}`}
            onClick={() => setTab("this-or-that")}
          >
            <Shuffle size={12} style={{ marginRight: 6 }} /> This or That
          </button>
          <button
            className={`chip ${tab === "voice" ? "chip-active" : ""}`}
            onClick={() => setTab("voice")}
          >
            <Mic size={12} style={{ marginRight: 6 }} /> Voice avatar
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "chat" ? (
          <div className="surface flex flex-col flex-1 min-h-0">
            {/* Aria header */}
            <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                   style={{ background: "var(--gold-dim)", border: "1px solid var(--border-gold)" }}>
                <Sparkles size={14} style={{ color: "var(--gold)" }} />
              </div>
              <div>
                <div className="font-display text-base leading-none" style={{ color: "var(--text)" }}>Aria</div>
                <div className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: "var(--text-muted)" }}>
                  AI Stylist · {items.length} items in context
                </div>
              </div>
              <button
                onClick={startNewChat}
                className="ml-auto text-xs"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
              >
                New chat
              </button>
              <Link href="/wardrobe" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                <ChevronRight size={14} />
              </Link>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
              <AnimatePresence>
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className="max-w-[82%] px-4 py-3"
                      style={m.role === "user" ? {
                        background: "var(--gold-dim)",
                        border: "1px solid var(--border-gold)",
                        color: "var(--ink)",
                        fontSize: "0.9rem",
                      } : {
                        background: "var(--surface)",
                        borderLeft: "3px solid #3C2415",
                        borderTop: "1px solid var(--border)",
                        borderRight: "1px solid var(--border)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--ink)",
                        fontSize: "0.9rem",
                      }}
                    >
                      {/* Photo bubble */}
                      {m.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.photoUrl}
                          alt="Shared photo"
                          style={{ maxWidth: 180, maxHeight: 220, objectFit: "cover", display: "block", marginBottom: 8 }}
                        />
                      )}
                      <FormattedReply
                        content={m.content}
                        itemIds={m.suggestedItemIds || []}
                        items={items}
                        manifesting={m.manifesting}
                        manifestUrl={m.manifestUrl}
                        savedOutfit={!!m.savedOutfit}
                        onManifest={m.role === "assistant" && (m.suggestedItemIds?.length ?? 0) > 0 ? () => manifestLook(i) : undefined}
                        onSaveOutfit={() => saveManifestOutfit(i)}
                      />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {loading && (
                <div className="flex justify-start">
                  <div className="flex gap-1 px-4 py-3"
                       style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    {[0, 0.15, 0.3].map((d, i) => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce inline-block"
                            style={{ background: "var(--text-dim)", animationDelay: `${d}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Suggestion chips */}
            <div className="px-4 pt-2 pb-1 flex gap-2 overflow-x-auto" style={{ borderTop: "1px solid var(--border)" }}>
              {SUGGESTION_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  disabled={loading}
                  className="chip whitespace-nowrap flex-shrink-0"
                  style={{ fontSize: "0.7rem" }}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Input area */}
            <div className="p-4 pt-2">
              {/* Photo preview */}
              <AnimatePresence>
                {photoPreview && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-2 flex items-center gap-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt="Attached"
                      style={{ width: 44, height: 44, objectFit: "cover", border: "1px solid var(--border)" }}
                    />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Photo attached</span>
                    <button
                      onClick={() => setPhotoPreview(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, marginLeft: "auto" }}
                    >
                      <X size={13} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-2 items-center">
                {/* Camera icon — photo upload */}
                <button
                  onClick={() => fileRef.current?.click()}
                  title="Attach photo"
                  style={{
                    background: "none",
                    border: "2px solid var(--border)",
                    cursor: "pointer",
                    color: "var(--text-dim)",
                    padding: "0.6rem",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ink)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--ink)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; }}
                >
                  <Camera size={16} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />

                <input
                  className="input"
                  placeholder={photoPreview ? "Add a note... (or press send)" : "Ask about an event, outfit, or color combo..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  disabled={loading}
                />
                <button
                  className="btn-primary"
                  onClick={() => send(input)}
                  disabled={(!input.trim() && !photoPreview) || loading}
                  style={{ padding: "0.72rem 1rem", flexShrink: 0 }}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>

        ) : tab === "this-or-that" ? (
          <ThisOrThat items={items} />

        ) : (
          <div className="surface flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                   style={{ background: "var(--gold-dim)", border: "1px solid var(--border-gold)" }}>
                <Mic size={14} style={{ color: "var(--gold)" }} />
              </div>
              <div>
                <div className="font-display text-base leading-none" style={{ color: "var(--text)" }}>Aria — Voice</div>
                <div className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: "var(--text-muted)" }}>Live voice session</div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <AvatarWidget />
            </div>

            <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Or type to switch to chat</div>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Type to switch to chat..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && input.trim()) {
                      const text = input;
                      setTab("chat");
                      setTimeout(() => send(text), 50);
                    }
                  }}
                />
                <button
                  className="btn-primary"
                  style={{ padding: "0.72rem 1rem" }}
                  onClick={() => {
                    if (!input.trim()) return;
                    const text = input;
                    setTab("chat");
                    setTimeout(() => send(text), 50);
                  }}
                  disabled={!input.trim()}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── This or That ─────────────────────────────────────────────────────────────

interface StyleCard {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  cutout_url?: string;
  category?: string;
}

function ThisOrThat({ items }: { items: WardrobeItem[] }) {
  const [mode, setMode] = useState<"items" | "styles">("items");
  const [choices, setChoices] = useState(0);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Item mode — client-side shuffle for zero latency
  const [pairIdx, setPairIdx] = useState(0);
  const pairs = useMemo(() => {
    const arr = [...items].sort(() => Math.random() - 0.5);
    const out: { a: WardrobeItem; b: WardrobeItem }[] = [];
    for (let i = 0; i + 1 < arr.length; i += 2) out.push({ a: arr[i], b: arr[i + 1] });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Style archetype mode — backend pairs
  const [stylePair, setStylePair] = useState<{ pair_id: string; item_a: StyleCard; item_b: StyleCard } | null>(null);
  const [loadingStyle, setLoadingStyle] = useState(false);

  async function fetchStylePair() {
    setLoadingStyle(true);
    try {
      const d = await apiGet<{ pair_id: string; item_a: StyleCard; item_b: StyleCard }>(
        "/api/stylist/this-or-that?type=styles"
      );
      setStylePair(d);
    } catch {
      toast.error("Could not load style pair.");
    } finally {
      setLoadingStyle(false);
    }
  }

  useEffect(() => {
    if (mode === "styles" && !stylePair) fetchStylePair();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function pickItem(chosen: WardrobeItem, other: WardrobeItem) {
    setLastPick(chosen.name);
    setChoices((c) => c + 1);
    setPairIdx((i) => i + 1);
    setSaving(true);
    try {
      await apiPost("/api/stylist/this-or-that", {
        pair_id: `local-${Date.now()}`,
        question_type: "items",
        item_a_id: chosen.id,
        item_b_id: other.id,
        chosen_id: chosen.id,
      });
    } catch { /* non-fatal */ } finally { setSaving(false); }
  }

  async function pickStyle(chosen: StyleCard, other: StyleCard) {
    setLastPick(chosen.name);
    setChoices((c) => c + 1);
    setSaving(true);
    try {
      await apiPost("/api/stylist/this-or-that", {
        pair_id: stylePair?.pair_id || `style-${Date.now()}`,
        question_type: "styles",
        item_a_id: chosen.id,
        item_b_id: other.id,
        chosen_id: chosen.id,
        chosen_name: chosen.name,
        rejected_name: other.name,
      });
    } catch { /* non-fatal */ } finally { setSaving(false); }
    fetchStylePair();
  }

  const feedbackLine =
    choices === 0 ? "Aria will use your choices to personalise every recommendation." :
    choices < 3  ? `Noted. ${3 - choices} more choice${3 - choices !== 1 ? "s" : ""} to warm up Aria.` :
    choices < 7  ? `Style fingerprint forming (${choices} data points) — chat with Aria to see it.` :
                   `Aria has a strong read on your aesthetic (${choices} choices) ✓`;

  if (items.length < 2 && mode === "items") {
    return (
      <div className="surface flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ color: "var(--text-muted)" }}>
        <Shuffle size={28} className="mb-3" style={{ color: "var(--text-dim)" }} />
        <p className="text-sm mb-3">Add at least two items to your wardrobe to compare pieces.</p>
        <button className="chip" onClick={() => setMode("styles")}>
          Switch to style archetypes →
        </button>
      </div>
    );
  }

  return (
    <div className="surface flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <div className="font-display text-xl leading-none">This or That</div>
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--text-muted)" }}>
            Training Aria&apos;s style read of you
          </div>
        </div>
        {saving && <Loader2 size={12} className="spin" style={{ color: "var(--text-dim)" }} />}
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 px-5 pt-4">
        <button className={`chip ${mode === "items" ? "chip-active" : ""}`} onClick={() => setMode("items")}>
          My items
        </button>
        <button className={`chip ${mode === "styles" ? "chip-active" : ""}`} onClick={() => setMode("styles")}>
          Style archetypes
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col items-center gap-4">
        <AnimatePresence>
          <motion.p
            key={feedbackLine}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-xs text-center"
            style={{ color: choices > 0 ? "var(--gold)" : "var(--text-muted)" }}
          >
            {feedbackLine}
          </motion.p>
        </AnimatePresence>

        {mode === "items" && (() => {
          const pair = pairs[pairIdx % pairs.length];
          return (
            <ItemPair
              a={pair.a} b={pair.b}
              onPick={(chosen) => pickItem(chosen, chosen.id === pair.a.id ? pair.b : pair.a)}
            />
          );
        })()}

        {mode === "styles" && (
          loadingStyle || !stylePair ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-dim)" }}>
              <Loader2 size={14} className="spin" /> Loading styles…
            </div>
          ) : (
            <StyleArchetypePair
              a={stylePair.item_a} b={stylePair.item_b}
              onPick={(chosen) => {
                const other = chosen.id === stylePair!.item_a.id ? stylePair!.item_b : stylePair!.item_a;
                pickStyle(chosen, other);
              }}
            />
          )
        )}

        {choices >= 3 && (
          <button
            className="btn-secondary"
            style={{ fontSize: "0.8rem", padding: "0.45rem 1rem" }}
            onClick={() => { if (mode === "items") { setPairIdx(0); setLastPick(null); } else fetchStylePair(); }}
          >
            <Shuffle size={13} /> Next pair
          </button>
        )}

        {choices >= 3 && (
          <div
            className="text-[10px] text-center max-w-xs"
            style={{ color: "var(--text-dim)", borderTop: "1px solid var(--border)", paddingTop: 12 }}
          >
            Switch to Text Chat and ask Aria for an outfit — she now knows your aesthetic from these choices.
          </div>
        )}
      </div>
    </div>
  );
}

function ItemPair({ a, b, onPick }: { a: WardrobeItem; b: WardrobeItem; onPick: (item: WardrobeItem) => void }) {
  return (
    <div className="relative grid grid-cols-2 gap-4 w-full max-w-sm">
      {[a, b].map((item) => (
        <motion.button
          key={item.id}
          whileHover={{ y: -4 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onPick(item)}
          className="surface text-left"
          style={{ padding: 0, cursor: "pointer", border: "1px solid var(--border)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.cutout_url || item.image_url}
            alt={item.name}
            className="w-full object-cover"
            style={{ aspectRatio: "3/4", display: "block" }}
          />
          <div className="p-2">
            <div className="text-xs font-mono truncate" style={{ color: "var(--text)" }}>{item.name}</div>
            <div className="text-[10px] capitalize mt-0.5" style={{ color: "var(--text-dim)" }}>{item.category}</div>
          </div>
        </motion.button>
      ))}
      <OrDivider />
    </div>
  );
}

function StyleArchetypePair({ a, b, onPick }: { a: StyleCard; b: StyleCard; onPick: (card: StyleCard) => void }) {
  return (
    <div className="relative grid grid-cols-2 gap-4 w-full max-w-sm">
      {[a, b].map((card) => (
        <motion.button
          key={card.id}
          whileHover={{ y: -4 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onPick(card)}
          className="surface text-left flex flex-col"
          style={{ padding: 0, cursor: "pointer", border: "1px solid var(--border)", minHeight: 160 }}
        >
          <div
            className="w-full flex items-center justify-center flex-1 p-4"
            style={{ background: "var(--surface2)", aspectRatio: "1/1" }}
          >
            <span className="font-display text-center leading-tight" style={{ fontSize: "1rem", color: "var(--text)" }}>
              {card.name}
            </span>
          </div>
          {card.description && (
            <div className="p-2">
              <div className="text-[9px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
                {card.description}
              </div>
            </div>
          )}
        </motion.button>
      ))}
      <OrDivider />
    </div>
  );
}

function OrDivider() {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: "calc(50% - 14px)",
        left: "calc(50% - 13px)",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        padding: "2px 7px",
        zIndex: 2,
      }}
    >
      <span className="text-xs font-mono" style={{ color: "var(--text-dim)" }}>or</span>
    </div>
  );
}

// ── Formatted reply ───────────────────────────────────────────────────────────

function FormattedReply({
  content, itemIds, items, manifesting, manifestUrl, savedOutfit, onManifest, onSaveOutfit,
}: {
  content: string;
  itemIds: string[];
  items: WardrobeItem[];
  manifesting?: boolean;
  manifestUrl?: string;
  savedOutfit?: boolean;
  onManifest?: () => void;
  onSaveOutfit?: () => void;
}) {
  // Strip the [ITEM:id] tokens from the displayed text (shown as cards below) and
  // tidy up so markdown bold still renders (e.g. "**[ITEM:x] Name**" -> "**Name**";
  // markdown ignores "** text**" with a space right after the **).
  const stripped = content
    .replace(/\s*\[ITEM:[a-zA-Z0-9\-]+\]\s*/g, " ")
    .replace(/\*\*\s+/g, "**")
    .replace(/\s+\*\*/g, "**")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  const referenced = items.filter((it) => itemIds.includes(it.id));

  return (
    <div>
      <div className="aria-md">
        <ReactMarkdown
          components={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            p: ({ children, ...rest }: any) => <p style={{ margin: "0 0 0.5rem" }} {...rest}>{children}</p>,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ul: ({ children, ...rest }: any) => <ul style={{ margin: "0.25rem 0 0.5rem", paddingLeft: "1.1rem", listStyle: "disc" }} {...rest}>{children}</ul>,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ol: ({ children, ...rest }: any) => <ol style={{ margin: "0.25rem 0 0.5rem", paddingLeft: "1.2rem" }} {...rest}>{children}</ol>,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            li: ({ children, ...rest }: any) => <li style={{ margin: "0.1rem 0" }} {...rest}>{children}</li>,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            strong: ({ children, ...rest }: any) => <strong style={{ color: "#3C2415", fontWeight: 700 }} {...rest}>{children}</strong>,
          }}
        >
          {stripped}
        </ReactMarkdown>
      </div>

      {/* Suggested item chips */}
      {referenced.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {referenced.map((it) => (
            <Link
              key={it.id}
              href="/studio"
              onClick={() => useAppStore.getState().setSelected([it.id])}
              className="flex items-center gap-2 px-2 py-1 text-xs"
              style={{ background: "var(--surface3)", color: "var(--text)", textDecoration: "none", border: "1px solid var(--border)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.cutout_url || it.image_url} alt={it.name} style={{ width: 24, height: 24, objectFit: "contain" }} />
              <span>{it.name}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Try all in Studio — only when 2+ items suggested */}
      {referenced.length >= 2 && !manifestUrl && (
        <Link
          href="/studio"
          onClick={() => useAppStore.getState().setSelected(itemIds)}
          className="btn-secondary"
          style={{ fontSize: "0.78rem", padding: "0.4rem 0.8rem", marginTop: 10, display: "inline-flex", gap: 6 }}
        >
          <Wand2 size={13} /> Try look in Studio
        </Link>
      )}

      {/* Manifest inline */}
      {referenced.length > 0 && onManifest && (
        <div className="mt-3">
          {manifestUrl ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={manifestUrl}
                alt="Your look"
                style={{ width: "100%", maxWidth: 280, borderRadius: 10, display: "block" }}
              />
              {onSaveOutfit && (
                <button
                  className="btn-secondary mt-2"
                  onClick={onSaveOutfit}
                  disabled={savedOutfit}
                  style={{ padding: "0.4rem 0.8rem", fontSize: "0.78rem" }}
                >
                  {savedOutfit ? (<><Check size={13} /> Saved to Outfits</>) : (<><Bookmark size={13} /> Save to Outfits</>)}
                </button>
              )}
            </div>
          ) : (
            <button
              className="btn-primary"
              onClick={onManifest}
              disabled={manifesting}
              style={{ padding: "0.5rem 0.9rem", fontSize: "0.8rem" }}
            >
              {manifesting ? (
                <><Loader2 size={14} className="spin" /> Manifesting your look…</>
              ) : (
                <><Sparkles size={14} /> Manifest this look</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
