"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, MessageCircle, ChevronRight,
  Camera, X, Shuffle, Plus, Bookmark, Check, ChevronDown, Trash2, ThumbsUp, ThumbsDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useWardrobeItems } from "@/lib/useWardrobeItems";
import { useStore } from "zustand";
import { useAppStore } from "@/store/app";
import { useAriaChat } from "@/store/ariaChat";
import { useAuth } from "@/components/AuthProvider";
import { apiGet, apiPost } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import type {
  ChatMessage,
  WardrobeItem,
  DetectedItem,
  StylistWardrobeDetectResponse,
  StylistWardrobeConfirmResponse,
} from "@/types";
import { AddToWardrobeModal } from "@/components/stylist/AddToWardrobeModal";
import posthog from "posthog-js";
import { PendingActionCard, type PendingActionResult } from "@/components/stylist/PendingActionCard";
import ThinkingIndicator from "@/components/stylist/ThinkingIndicator";
import TrainTasteModal from "@/components/stylist/TrainTasteModal";
import { CapsulePlanCard } from "@/components/stylist/CapsulePlanCard";
import type { CapsulePlan } from "@/types";

const SUGGESTION_PROMPTS = [
  "Does this suit my color season?",
  "Paste a Myntra URL — verdict please",
  "5-day work trip to Milan — capsule from my closet",
  "What am I missing for a business trip?",
];

export default function StylistPage() {
  const { user, profile } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0];
  const [trainTasteOpen, setTrainTasteOpen] = useState(false);
  const {
    messages,
    setMessages,
    hydrated,
    sessions,
    currentSessionId,
    loadSessions,
    createSession,
    setCurrentSession,
    deleteSession,
    updateSession,
    newChat,
  } = useStore(useAriaChat);
  const greeting = (): ChatMessage => ({
    role: "assistant",
    content: firstName
      ? `Hey ${firstName} — what are we styling today? I can pick from your closet, try on a look, or add items from a photo (you confirm before anything runs).`
      : "Hey — what are we styling today? I can pick from your closet, try on a look, or add items from a photo.",
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStartedAt, setThinkingStartedAt] = useState<number | null>(null);
  const { items, refresh: refreshWardrobe, count: wardrobeCount, countReady: wardrobeCountReady } = useWardrobeItems();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  
  // Wardrobe add from chat
  const [wardrobeModal, setWardrobeModal] = useState<{
    detected: DetectedItem[];
    sourceImageUrl: string;
  } | null>(null);
  const [detecting, setDetecting] = useState(false);

  // Load session list once user is present (chat body rehydrates in LayoutClient).
  useEffect(() => {
    if (!user) return;
    loadSessions().catch(() => toast.error("Failed to load chat history"));
  }, [user, loadSessions]);

  // Greeting only after localStorage hydration + optional server session restore.
  useEffect(() => {
    if (!hydrated) return;
    if (messages.length === 0) setMessages([{ ...greeting(), createdAt: new Date().toISOString() }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, messages.length, firstName]);

  // Close session picker on outside click
  useEffect(() => {
    if (!showSessionPicker) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-session-picker]")) setShowSessionPicker(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSessionPicker]);

  async function startNewChat() {
    try {
      await newChat();
      setMessages([{ ...greeting(), createdAt: new Date().toISOString() }]);
      toast.success("Started new chat");
    } catch (e) {
      toast.error(`Failed to start new chat: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

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

  function wardrobeAddedMessage(result: PendingActionResult): string {
    const names = result.created?.map((c) => c.name).filter(Boolean);
    if (names?.length) {
      return `Added to your wardrobe: ${names.join(", ")}.`;
    }
    if (result.failed?.length) {
      return `Couldn't add that to your wardrobe: ${result.failed.map((f) => f.reason).join("; ")}`;
    }
    return result.summary || "Added to your wardrobe.";
  }

  function resolvePendingAction(idx: number, result: PendingActionResult) {
    setMessages((prev) => {
      const updated = prev.map((m, i) => {
        if (i !== idx || !m.pendingAction) return m;
        return {
          ...m,
          pendingAction: { ...m.pendingAction, status: result.status },
          ...(result.resultImageUrl
            ? { manifestUrl: result.resultImageUrl, manifestId: result.resultId }
            : {}),
        };
      });

      if (result.status !== "confirmed") {
        return [
          ...updated,
          {
            role: "assistant" as const,
            content: result.summary,
            createdAt: new Date().toISOString(),
          },
        ];
      }

      if (result.resultImageUrl) {
        const parent = prev[idx];
        return [
          ...updated,
          {
            role: "assistant" as const,
            content: result.summary || "Here's your try-on!",
            manifestUrl: result.resultImageUrl,
            manifestId: result.resultId,
            suggestedItemIds: parent?.suggestedItemIds,
            scene: parent?.scene,
            createdAt: new Date().toISOString(),
          },
        ];
      }

      if (result.toolName === "add_wardrobe_items") {
        return [
          ...updated,
          {
            role: "assistant" as const,
            content: wardrobeAddedMessage(result),
            createdAt: new Date().toISOString(),
          },
        ];
      }

      return [
        ...updated,
        {
          role: "assistant" as const,
          content: result.summary,
          createdAt: new Date().toISOString(),
        },
      ];
    });

    if (result.status === "confirmed") {
      if (result.toolName === "add_wardrobe_items") {
        if (result.created?.length) {
          toast.success(`Added ${result.created.length} item${result.created.length === 1 ? "" : "s"} to wardrobe`);
          refreshWardrobe().catch(() => {});
        } else {
          toast.error(result.failed?.length ? `Couldn't add that: ${result.failed[0].reason}` : "Couldn't add that to your wardrobe");
        }
      } else if (result.resultImageUrl) {
        toast.success("Try-on ready");
      }
    }

    const sessionId = useAriaChat.getState().currentSessionId;
    if (sessionId) {
      setTimeout(() => {
        const latest = useAriaChat.getState().messages;
        updateSession(latest).catch(() => {});
      }, 0);
    }
  }

  async function submitFeedback(idx: number, rating: "up" | "down") {
    const msg = messages[idx];
    if (msg.role !== "assistant" || msg.feedbackRating) return;
    try {
      await apiPost("/api/stylist/feedback", {
        rating,
        item_ids: msg.suggestedItemIds || [],
        note: msg.content.slice(0, 240),
      });
      setMessages((prev) =>
        prev.map((m, i) => (i === idx ? { ...m, feedbackRating: rating } : m))
      );
      posthog.capture("stylist_feedback", { rating });
      toast.success(rating === "up" ? "Thanks — I'll remember that" : "Noted — I'll adjust");
      const sessionId = useAriaChat.getState().currentSessionId;
      if (sessionId) {
        setTimeout(() => updateSession(useAriaChat.getState().messages).catch(() => {}), 0);
      }
    } catch (e) {
      toast.error(`Feedback failed: ${e instanceof Error ? e.message : "unknown"}`);
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

  async function handleAddToWardrobe() {
    if (!photoPreview) return;
    setDetecting(true);
    try {
      const res = await apiPost<StylistWardrobeDetectResponse>("/api/stylist/wardrobe-detect", {
        image_data: photoPreview,
      });
      if (res.detected.length === 0) {
        toast.error("No clothing items detected in this photo.");
        return;
      }
      setWardrobeModal({ detected: res.detected, sourceImageUrl: res.image_url });
    } catch (e) {
      toast.error(`Detection failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setDetecting(false);
    }
  }

  async function confirmWardrobeAdd(items: DetectedItem[]) {
    if (!wardrobeModal) throw new Error("No modal data");
    const res = await apiPost<StylistWardrobeConfirmResponse>("/api/stylist/wardrobe-confirm", {
      source_image_url: wardrobeModal.sourceImageUrl,
      items,
    });
    const added = res.created.length > 0;
    // Inject a synthetic Aria message
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: added
          ? `Done! I added ${res.summary} to your wardrobe.`
          : `Couldn't add that to your wardrobe: ${res.failed.map((f) => f.reason).join("; ") || "unknown error"}`,
        createdAt: new Date().toISOString(),
      },
    ]);
    if (added) {
      toast.success(`Added ${res.summary} to wardrobe`);
      refreshWardrobe().catch(() => {});
    } else {
      toast.error("Couldn't add that to your wardrobe");
    }
    // Clear photo preview and close modal
    setPhotoPreview(null);
    setWardrobeModal(null);
    return res;
  }

  async function send(text: string) {
    const hasContent = text.trim() || photoPreview;
    if (!hasContent || loading) return;

    let content = text.trim();
    if (photoPreview && !content) content = "What do you think of this?";
    else if (photoPreview) content = `${content}`;

    posthog.capture("stylist_message_sent", { has_photo: !!photoPreview });

    const userMsg: ChatMessage = {
      role: "user",
      content,
      photoUrl: photoPreview || undefined,
      createdAt: new Date().toISOString(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    const attachedPhoto = photoPreview;
    setPhotoPreview(null);
    setLoading(true);
    setThinkingStartedAt(Date.now());

    const hadSession = !!useAriaChat.getState().currentSessionId;
    const isFirstMessage = !hadSession && messages.filter((m) => m.role === "user").length === 0;

    try {
      if (isFirstMessage) {
        const title = content.slice(0, 60) || "New chat";
        await createSession(next, title);
      }

      const payload: Record<string, unknown> = {
        messages: next.map((m) => ({
          role: m.role,
          content: m.photoUrl ? `[Photo shared] ${m.content}` : m.content,
        })),
      };
      if (attachedPhoto) payload.image_url = attachedPhoto;

      const res = await apiPost<{
        reply: string;
        suggested_item_ids: string[];
        scene?: string | null;
        pending_action?: {
          tool_name: string;
          tool_use_id: string;
          summary: string;
          cost_credits?: number | null;
        } | null;
        product_preview?: {
          image_url: string;
          name: string;
          source_url: string;
          suggested_category?: string | null;
        } | null;
        capsule_plan?: CapsulePlan | null;
      }>("/api/stylist/chat", payload);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.reply,
        suggestedItemIds: res.suggested_item_ids,
        scene: res.scene,
        createdAt: new Date().toISOString(),
        pendingAction: res.pending_action
          ? {
              toolName: res.pending_action.tool_name,
              toolUseId: res.pending_action.tool_use_id,
              summary: res.pending_action.summary,
              costCredits: res.pending_action.cost_credits,
              status: "pending",
            }
          : undefined,
        productPreview: res.product_preview
          ? {
              imageUrl: res.product_preview.image_url,
              name: res.product_preview.name,
              sourceUrl: res.product_preview.source_url,
              suggestedCategory: res.product_preview.suggested_category,
            }
          : undefined,
        capsulePlan: res.capsule_plan ?? undefined,
      };
      const updatedMessages = [...next, assistantMsg];
      setMessages(updatedMessages);

      const sessionId = useAriaChat.getState().currentSessionId;
      if (sessionId) {
        try {
          await updateSession(updatedMessages);
        } catch (e) {
          toast.error(`Session save failed: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    } catch (e) {
      toast.error(`Stylist failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setLoading(false);
      setThinkingStartedAt(null);
    }
  }

  function formatMsgTime(iso?: string) {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return null;
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="surface flex flex-col flex-1 min-h-0">
            {/* Chat toolbar */}
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border text-xs text-muted">
              {wardrobeCountReady ? (
                <span className="font-mono">{wardrobeCount} items in wardrobe</span>
              ) : (
                <span
                  className="inline-block h-3 w-28 rounded shimmer"
                  aria-label="Loading wardrobe"
                />
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTrainTasteOpen(true)}
                  className="icon-btn"
                  title="Train Aria's taste"
                >
                  <Shuffle size={14} />
                </button>
                <div className="relative" data-session-picker>
                  <button
                    type="button"
                    onClick={() => setShowSessionPicker(!showSessionPicker)}
                    className="icon-btn"
                    title="Chat history"
                  >
                    <MessageCircle size={14} />
                    <ChevronDown size={12} />
                  </button>
                  {showSessionPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute right-0 top-full mt-2 surface"
                      style={{
                        minWidth: 240,
                        maxWidth: 320,
                        maxHeight: 400,
                        overflowY: "auto",
                        border: "1px solid var(--border)",
                        zIndex: 10,
                      }}
                    >
                      <div className="p-2 space-y-1">
                        {sessions.length === 0 ? (
                          <div className="text-xs text-center py-4 text-muted">
                            No chat history yet
                          </div>
                        ) : (
                          sessions.map((session) => (
                            <div
                              key={session.id}
                              className="flex items-center gap-2 rounded-sm"
                              style={{
                                background: currentSessionId === session.id ? "var(--gold-dim)" : "transparent",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setCurrentSession(session.id).catch((e) =>
                                    toast.error(`Load failed: ${e instanceof Error ? e.message : "unknown"}`)
                                  );
                                  setShowSessionPicker(false);
                                }}
                                className="flex-1 text-left px-3 py-2 text-xs bg-transparent border-0 cursor-pointer text-ink"
                              >
                                <div className="font-medium truncate">
                                  {session.title || "Untitled chat"}
                                </div>
                                <div className="text-2xs mt-0.5 text-muted">
                                  {new Date(session.updated_at).toLocaleDateString()} ·{" "}
                                  {session.messages.length} msg{session.messages.length !== 1 ? "s" : ""}
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Delete this chat?")) {
                                    deleteSession(session.id).catch((err) =>
                                      toast.error(`Delete failed: ${err instanceof Error ? err.message : "unknown"}`)
                                    );
                                  }
                                }}
                                className="px-2 bg-transparent border-0 cursor-pointer text-dim"
                                title="Delete chat"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={startNewChat}
                  className="icon-btn"
                  title="Start new chat"
                >
                  <Plus size={14} />
                </button>
                <Link href="/wardrobe" className="icon-btn text-muted no-underline" title="Wardrobe">
                  <ChevronRight size={14} />
                </Link>
              </div>
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
                      className="max-w-[82%] px-4 py-3 text-sm"
                      style={m.role === "user" ? {
                        background: "var(--gold-dim)",
                        border: "1px solid var(--border-gold)",
                        color: "var(--ink)",
                      } : {
                        background: "var(--surface)",
                        borderLeft: "3px solid #3C2415",
                        borderTop: "1px solid var(--border)",
                        borderRight: "1px solid var(--border)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--ink)",
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
                      {m.productPreview && (
                        <a
                          href={m.productPreview.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 mb-2"
                          style={{ border: "1px solid var(--border)", padding: 6, textDecoration: "none" }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.productPreview.imageUrl}
                            alt={m.productPreview.name}
                            style={{ width: 44, height: 44, objectFit: "cover", flexShrink: 0 }}
                          />
                          <span className="text-xs truncate" style={{ color: "var(--ink)" }}>
                            {m.productPreview.name}
                          </span>
                        </a>
                      )}
                      <FormattedReply
                        content={m.content}
                        itemIds={m.suggestedItemIds || []}
                        items={items}
                        manifestUrl={m.manifestUrl}
                        savedOutfit={!!m.savedOutfit}
                        onSaveOutfit={m.manifestUrl ? () => saveManifestOutfit(i) : undefined}
                      />
                      {m.capsulePlan && <CapsulePlanCard plan={m.capsulePlan} />}
                      {m.role === "assistant" && i > 0 && (
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                          <span className="text-2xs text-muted mr-1">Helpful?</span>
                          <button
                            type="button"
                            aria-label="Thumbs up"
                            disabled={!!m.feedbackRating}
                            onClick={() => submitFeedback(i, "up")}
                            className={`p-1 rounded ${m.feedbackRating === "up" ? "text-accent" : "text-muted hover:text-foreground"}`}
                          >
                            <ThumbsUp size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label="Thumbs down"
                            disabled={!!m.feedbackRating}
                            onClick={() => submitFeedback(i, "down")}
                            className={`p-1 rounded ${m.feedbackRating === "down" ? "text-accent" : "text-muted hover:text-foreground"}`}
                          >
                            <ThumbsDown size={14} />
                          </button>
                        </div>
                      )}
                      {formatMsgTime(m.createdAt) && (
                        <p className="text-2xs text-muted mt-2 mb-0 text-right">{formatMsgTime(m.createdAt)}</p>
                      )}
                      {m.pendingAction && (
                        <PendingActionCard
                          action={m.pendingAction}
                          onResolve={(result) => resolvePendingAction(i, result)}
                        />
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {loading && thinkingStartedAt && <ThinkingIndicator startedAt={thinkingStartedAt} />}
            </div>

            {/* Suggestion chips */}
            <div className="px-4 pt-2 pb-1 flex gap-2 overflow-x-auto" style={{ borderTop: "1px solid var(--border)" }}>
              {SUGGESTION_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  disabled={loading}
                  className="chip whitespace-nowrap flex-shrink-0"
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
                  placeholder={photoPreview ? "Add a note about this photo..." : "Ask for an outfit, paste a URL, or request a try-on..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  disabled={loading}
                />
                {photoPreview && (
                  <button
                    className="btn-secondary"
                    onClick={handleAddToWardrobe}
                    disabled={detecting}
                    style={{ padding: "0.72rem 1rem", flexShrink: 0 }}
                  >
                    {detecting ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                  </button>
                )}
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
      </div>

      <TrainTasteModal open={trainTasteOpen} onClose={() => setTrainTasteOpen(false)} />

      <AnimatePresence>
        {wardrobeModal && (
          <AddToWardrobeModal
            detected={wardrobeModal.detected}
            sourceImageUrl={wardrobeModal.sourceImageUrl}
            onClose={() => setWardrobeModal(null)}
            onConfirm={confirmWardrobeAdd}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Formatted reply ───────────────────────────────────────────────────────────

function FormattedReply({
  content, itemIds, items, manifestUrl, savedOutfit, onSaveOutfit,
}: {
  content: string;
  itemIds: string[];
  items: WardrobeItem[];
  manifestUrl?: string;
  savedOutfit?: boolean;
  onSaveOutfit?: () => void;
}) {
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

      {referenced.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {referenced.map((it) => (
            <Link
              key={it.id}
              href="/studio"
              onClick={() => useAppStore.getState().setSelected(referenced.length >= 2 ? itemIds : [it.id])}
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

      {manifestUrl && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={manifestUrl}
            alt="Your look"
            className="rounded-sm"
            style={{ width: "100%", maxWidth: 280, display: "block" }}
          />
          {onSaveOutfit && (
            <button
              type="button"
              className="btn-secondary mt-2"
              onClick={onSaveOutfit}
              disabled={savedOutfit}
              style={{ padding: "0.4rem 0.8rem" }}
            >
              {savedOutfit ? (<><Check size={13} /> Saved to Outfits</>) : (<><Bookmark size={13} /> Save to Outfits</>)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
