"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ReactCompareSlider, ReactCompareSliderImage } from "react-compare-slider";
import {
  Sparkles, MapPin, Film, Loader2, Save, ArrowLeftRight, Shirt, AlertCircle, Share2,
  User as UserIcon, RefreshCw, X, Plus, Trash2, ChevronDown, Download,
} from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { GeneratingState } from "@/components/studio/GeneratingState";
import { downloadWithWatermark } from "@/components/studio/ShareCard";
import { ShareToFriendModal } from "@/components/ShareToFriendModal";
import { PromptDialog, ConfirmDialog } from "@/components/ui/Dialog";
import { AddItemModal } from "@/components/wardrobe/AddItemModal";
import { useAppStore } from "@/store/app";
import { useAuth } from "@/components/AuthProvider";
import { useTasks, selectActiveTryOn } from "@/store/tasks";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { TRYON_MODELS, VIDEO_MODELS } from "@/lib/models";
import { useSeenOnce } from "@/lib/useSeenOnce";
import type { WardrobeItem, TryOnResult } from "@/types";

const MOTION_PRESETS = [
  { label: "Slow turn to camera", prompt: "The subject slowly turns toward the camera with a confident editorial pose, gentle hair movement." },
  { label: "Runway walk", prompt: "The subject walks toward the camera like a fashion runway model, full-body, smooth confident stride." },
  { label: "Windswept editorial", prompt: "Ambient breeze moves the hair and fabric, the subject shifts weight subtly, cinematic slow motion." },
];

const EVENT_PRESETS = [
  "beach wedding, golden hour",
  "rooftop cocktail party at night",
  "casual brunch in a sunny garden",
  "formal job interview, modern office lobby",
  "evening art gallery opening",
  "city street, autumn leaves",
];

export default function StudioPage() {
  const { user } = useAuth();
  const {
    avatarSelfieUrl,
    selectedItemIds,
    setSelected,
    clearSelected,
    stylizedAvatarUrl,
    stylizedAvatarStatus,
    setStylized,
    tryonModel,
    videoModel,
    setTryonModel,
    setVideoModel,
    cachedWardrobe,
    cachedRecent,
    setCachedWardrobe,
    setCachedRecent,
  } = useAppStore();
  const [items, setItems] = useState<WardrobeItem[]>(cachedWardrobe);
  const [showCompare, setShowCompare] = useState(false);
  const [eventInput, setEventInput] = useState("");
  const [motionPrompt, setMotionPrompt] = useState(MOTION_PRESETS[0].prompt);
  const [showShare, setShowShare] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selfiesLoaded, setSelfiesLoaded] = useState(false);
  const [quality, setQuality] = useState<"standard" | "pro">("pro");
  const [settingInput, setSettingInput] = useState("");
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  // Which selfie URL to use as the avatar reference for try-on (own primary, or a borrowed one)
  const [activeFaceUrl, setActiveFaceUrl] = useState<string | null>(null);
  const [refreshingAvatar, setRefreshingAvatar] = useState(false);
  // null = still loading; false = the user has uploaded no photo at all.
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null);
  const taskHintSeen = useSeenOnce("studio-task-hint");
  const [recentTryOns, setRecentTryOns] = useState<TryOnResult[]>(cachedRecent);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [pendingDelete, setPendingDelete] = useState<WardrobeItem | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const CATEGORIES = ["all", "tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!showFilterMenu) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-filter-menu]")) setShowFilterMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showFilterMenu]);

  // On-demand "Refresh my avatar": regenerates the realistic hero still (~5cr) + polls.
  async function refreshAvatar() {
    if (refreshingAvatar) return;
    setRefreshingAvatar(true);
    setStylized(stylizedAvatarUrl, "generating" as never);
    try {
      await apiPost("/api/avatar/regenerate-stylized", {}); // still only (no video)
      toast.success("Refreshing your avatar…");
      for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const d = await apiGet<{ url: string | null; status: string }>("/api/avatar/stylized");
        setStylized(d.url, d.status as never);
        if (d.status === "ready" || d.status === "failed") break;
      }
    } catch (e) {
      setStylized(stylizedAvatarUrl, "failed" as never);
      toast.error(`Refresh failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setRefreshingAvatar(false);
    }
  }

  function handleQuickAddMany(items: WardrobeItem[]) {
    setItems((prev) => [...items, ...prev]);
    if (items.length > 0) {
      const firstId = items[0].id;
      const currentSelected = useAppStore.getState().selectedItemIds;
      const next = currentSelected.includes(firstId) ? currentSelected : [...currentSelected, firstId].slice(-2);
      setSelected(next);
    }
  }

  async function performDelete(id: string) {
    try {
      await apiDelete(`/api/wardrobe/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Item removed.");
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  // Tasks live in a global store -> survive page navigation
  const startTryOn = useTasks((s) => s.startTryOn);
  const startEventScene = useTasks((s) => s.startEventScene);
  const startAnimate = useTasks((s) => s.startAnimate);
  const cancelTryOn = useTasks((s) => s.cancelTryOn);
  const activeTryOn = useTasks(selectActiveTryOn);

  const generating = activeTryOn?.status === "running";
  const resultUrl = activeTryOn?.resultUrl;
  const resultId = activeTryOn?.resultId;
  const eventUrl = activeTryOn?.eventUrl;
  const videoUrl = activeTryOn?.videoUrl;

  // Other ongoing operations - simple booleans derived from store
  const eventLoading = useTasks((s) =>
    s.tasks.some((t) => t.kind === "event" && t.status === "running" && t.parentTryOnDbId === resultId)
  );
  const animating = useTasks((s) =>
    s.tasks.some((t) => t.kind === "animate" && t.status === "running")
  );

  useEffect(() => {
    if (!user) return;

    // Show the cached selfie immediately — no shimmer on repeat visits.
    const borrowed = typeof window !== "undefined" ? sessionStorage.getItem("studio_borrowed_face") : null;
    if (borrowed) {
      setActiveFaceUrl(borrowed);
      sessionStorage.removeItem("studio_borrowed_face");
      setHasPhoto(true);
      setSelfiesLoaded(true);
      toast.success("Using a borrowed face for this session");
    } else if (avatarSelfieUrl) {
      setActiveFaceUrl(avatarSelfieUrl);
      setHasPhoto(true);
      setSelfiesLoaded(true);
    }

    // Background fetches — update state and cache when they land.
    apiGet<WardrobeItem[]>(`/api/wardrobe`).then(data => { setItems(data); setCachedWardrobe(data); }).catch(() => {});
    apiGet<TryOnResult[]>("/api/tryon/recent?all=true").then(r => { const s = r.slice(0, 8); setRecentTryOns(s); setCachedRecent(s); }).catch(() => {});
    Promise.all([
      apiGet<{ selfie_urls: string[]; primary_url: string | null }>("/api/avatar/selfies").catch(() => null),
      apiGet<{ full_body_url: string | null }>("/api/avatar/full-body").catch(() => null),
    ]).then(([d, b]) => {
      const selfies = d?.selfie_urls || [];
      const photoExists = !!(d?.primary_url || selfies.length || b?.full_body_url);
      setHasPhoto(photoExists);
      if (!borrowed) {
        if (photoExists) {
          setActiveFaceUrl((cur) => cur || d?.primary_url || selfies[0] || b?.full_body_url || avatarSelfieUrl);
        } else {
          setActiveFaceUrl(null);
        }
      }
      setSelfiesLoaded(true);
    }).catch(() => { setActiveFaceUrl(avatarSelfieUrl); setSelfiesLoaded(true); });
  }, [user, avatarSelfieUrl]);

  // Poll stylized avatar only when it isn't already ready in the cache.
  useEffect(() => {
    if (!user) return;
    if (stylizedAvatarStatus === "ready") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const d = await apiGet<{ url: string | null; status: string }>("/api/avatar/stylized");
        if (cancelled) return;
        setStylized(d.url, d.status as never);
        if (d.status === "generating") timer = setTimeout(tick, 4000);
      } catch {
        if (!cancelled) timer = setTimeout(tick, 8000);
      }
    }
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [user, stylizedAvatarStatus, setStylized]);

  const selectedItems = items.filter((i) => selectedItemIds.includes(i.id));
  const effectiveSelfieUrl = activeFaceUrl || avatarSelfieUrl;

  const CAT_ORDER = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];
  const filteredItems = filterCategory === "all" ? items : items.filter((i) => (i.category || "other").toLowerCase() === filterCategory);
  const groupedItems = filteredItems.reduce<Record<string, WardrobeItem[]>>((acc, it) => {
    const cat = (it.category || "other").toLowerCase();
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(it);
    return acc;
  }, {});
  const sortedCategories = [
    ...CAT_ORDER.filter((c) => groupedItems[c]?.length),
    ...Object.keys(groupedItems).filter((c) => !CAT_ORDER.includes(c) && groupedItems[c]?.length),
  ];

  // Category-aware selection: one item per outfit "slot" (top, bottom, outerwear,
  // shoes). A dress is mutually exclusive with tops + bottoms. Accessories stack.
  function selectItem(item: WardrobeItem) {
    const id = item.id;
    const cat = (item.category || "tops").toLowerCase();
    if (selectedItemIds.includes(id)) {
      setSelected(selectedItemIds.filter((x) => x !== id));
      return;
    }
    const catOf = (iid: string) => (items.find((w) => w.id === iid)?.category || "").toLowerCase();
    let next = [...selectedItemIds];
    if (cat === "accessories") {
      next.push(id);
    } else if (cat === "dresses") {
      next = next.filter((x) => !["dresses", "tops", "bottoms"].includes(catOf(x)));
      next.push(id);
    } else if (cat === "tops" || cat === "bottoms") {
      next = next.filter((x) => catOf(x) !== cat && catOf(x) !== "dresses");
      next.push(id);
    } else {
      next = next.filter((x) => catOf(x) !== cat);
      next.push(id);
    }
    setSelected(next);
  }

  function reset() {
    setShowCompare(false);
    setEventInput("");
  }

  function generate() {
    if (!effectiveSelfieUrl) { toast.error("Upload your selfie first (Avatar Setup)."); return; }
    if (selectedItems.length === 0) { toast.error("Select at least one item from your wardrobe."); return; }
    setShowCompare(false);
    startTryOn({
      items: selectedItems,
      avatarSelfieUrl: effectiveSelfieUrl,
      setting: settingInput.trim() || undefined,
      quality,
      model: tryonModel,
      enhancePrompt,
    });
  }

  function generateEventScene(context: string) {
    if (!resultUrl || !activeTryOn) return;
    startEventScene({
      parentTaskId: activeTryOn.id,
      parentTryOnDbId: resultId,
      tryOnImageUrl: resultUrl,
      context,
    });
  }

  function animate() {
    const sourceUrl = eventUrl || resultUrl;
    if (!sourceUrl || !activeTryOn) return;
    startAnimate({
      sourceUrl,
      parentTaskId: activeTryOn.id,
      parentTryOnDbId: resultId,
      model: videoModel,
      motionPrompt: motionPrompt.trim() || undefined,
      enhancePrompt,
    });
  }

  async function saveOutfit(name: string) {
    try {
      await Promise.all([
        apiPost("/api/outfits/save", {
          name,
          item_ids: selectedItemIds,
          preview_image_url: eventUrl || resultUrl,
          tryon_result_id: resultId,
        }),
        // Also mark the underlying try-on as saved so it appears in the gallery
        resultId ? apiPost("/api/tryon/save", { tryon_id: resultId }).catch(() => {}) : Promise.resolve(),
      ]);
      toast.success("Saved to Outfits + gallery.");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async function saveTryOnOnly() {
    if (!resultId) return;
    try {
      await apiPost("/api/tryon/save", { tryon_id: resultId });
      toast.success("Added to your gallery.");
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0">
        <PageHeader
          subtitle="Pick 1 or 2 items from your wardrobe, then generate a try-on on your avatar."
          tutorialKey="studio"
        />

        {selfiesLoaded && !effectiveSelfieUrl && (
          <div className="surface p-5 mb-6 flex items-start gap-3" style={{ background: "var(--surface2)" }}>
            <AlertCircle size={18} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }} />
            <div className="text-sm">
              <strong>Avatar not set.</strong> Upload your selfie in <Link href="/settings" style={{ color: "var(--text)", textDecoration: "underline" }}>Settings</Link> to enable try-ons.
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div className="surface p-5 mb-6 flex items-start gap-3">
            <Shirt size={18} style={{ color: "var(--text-dim)", flexShrink: 0, marginTop: 2 }} />
            <div className="text-sm">
              <strong>Empty wardrobe.</strong>{" "}
              <button onClick={() => setShowQuickAdd(true)} className="underline" style={{ color: "var(--gold)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}>Add your first item</button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3 relative" data-filter-menu>
          <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Wardrobe</span>
          <button
            onClick={() => setShowFilterMenu((v) => !v)}
            className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded"
            style={{ background: "var(--surface2)", border: "1px solid var(--border-hover)", color: "var(--text-muted)", cursor: "pointer" }}
          >
            {filterCategory === "all" ? "All" : filterCategory} <ChevronDown size={10} />
          </button>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="btn-secondary text-xs"
            style={{ padding: "0.25rem 0.6rem", minHeight: "unset" }}
          >
            <Plus size={12} style={{ marginRight: 4 }} /> Add
          </button>
          {showFilterMenu && (
            <div className="absolute top-full left-0 mt-1 surface z-50 py-1" style={{ minWidth: 120 }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => { setFilterCategory(c); setShowFilterMenu(false); }}
                  className="w-full text-left text-xs px-3 py-1.5"
                  style={{
                    background: filterCategory === c ? "var(--gold-dim)" : "none",
                    color: filterCategory === c ? "var(--gold)" : "var(--text-muted)",
                    border: "none", cursor: "pointer",
                  }}
                >
                  {c === "all" ? "All items" : c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
      <div className="lg:h-full flex flex-col lg:grid lg:grid-cols-12 lg:grid-rows-1 gap-6">
        <div className="lg:col-span-3 lg:min-h-0 lg:h-full">
          <div className="surface p-3 lg:h-full flex flex-col" style={{ background: "var(--surface3)" }}>
          {/* Mobile: flat horizontal scroll */}
          <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {items.map((it) => {
              const sel = selectedItemIds.includes(it.id);
              return (
                <button
                  key={it.id}
                  onClick={() => selectItem(it)}
                  className="overflow-hidden relative flex-shrink-0 w-20 h-20 rounded"
                  style={{ padding: 0, cursor: "pointer", background: "#fff", border: sel ? "2px solid var(--ink)" : "1px solid var(--border-hover)" }}
                  title={it.name}
                >
                  <div className="relative w-full aspect-square">
                    <Image src={it.image_url} alt={it.name} fill className="object-cover" sizes="80px" />
                  </div>
                  {sel && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                         style={{ background: "var(--ink)", color: "var(--parchment)" }}>
                      {selectedItemIds.indexOf(it.id) + 1}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Desktop: grouped by category with section headers */}
          <div className="hidden lg:flex lg:flex-col gap-3 overflow-y-auto flex-1 min-h-0 pr-1">
            {sortedCategories.length === 0 && filterCategory !== "all" && (
              <div className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
                No items in {filterCategory}.
              </div>
            )}
            {sortedCategories.map((cat) => (
              <div key={cat}>
                <div
                  className="text-[9px] font-mono uppercase tracking-widest mb-1.5 px-0.5 font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  {cat}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {groupedItems[cat].map((it) => {
                    const sel = selectedItemIds.includes(it.id);
                    return (
                      <button
                        key={it.id}
                        onClick={() => selectItem(it)}
                        className="overflow-hidden relative group rounded"
                        style={{ padding: 0, cursor: "pointer", background: "#fff", border: sel ? "2px solid var(--ink)" : "1px solid var(--border-hover)" }}
                        title={it.name}
                      >
                        <div className="relative w-full aspect-square">
                          <Image src={it.image_url} alt={it.name} fill className="object-cover" sizes="120px" />
                          {sel && (
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                                 style={{ background: "var(--ink)", color: "var(--parchment)" }}>
                              {selectedItemIds.indexOf(it.id) + 1}
                            </div>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setPendingDelete(it); }}
                            className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                            style={{ background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", cursor: "pointer" }}
                            aria-label={`Delete ${it.name}`}
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                        <div className="px-1.5 py-1" style={{ background: "var(--surface)" }}>
                          <div className="truncate text-[10px] font-medium" style={{ color: "var(--text)" }}>{it.name}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>

        <div className="lg:col-span-6 lg:min-h-0 lg:overflow-y-auto">
          {generating ? (
            <GeneratingState avatarUrl={effectiveSelfieUrl} itemUrls={activeTryOn?.itemImageUrls || []} startedAt={activeTryOn?.startedAt} />
          ) : resultUrl ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="surface overflow-hidden"
              style={{
                backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            >
              {videoUrl ? (
                <video src={videoUrl} controls autoPlay loop
                  style={{ display: "block", margin: "0 auto", maxHeight: "72vh", maxWidth: "100%" }} />
              ) : showCompare && effectiveSelfieUrl ? (
                <div style={{ maxWidth: "calc(72vh * 9 / 16)", margin: "0 auto" }}>
                  <ReactCompareSlider
                    itemOne={<ReactCompareSliderImage src={effectiveSelfieUrl} alt="Before" />}
                    itemTwo={<ReactCompareSliderImage src={resultUrl} alt="After" />}
                    style={{ aspectRatio: "9/16", width: "100%" }}
                  />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={eventUrl || resultUrl} alt="Try-on result"
                  style={{ display: "block", margin: "0 auto", maxHeight: "72vh", maxWidth: "100%" }} />
              )}
            </motion.div>
          ) : (
            <div className="flex justify-center lg:h-full">
              <div className="surface overflow-hidden relative"
                   style={{ height: "min(100%, 72vh)", aspectRatio: "3/4" }}>
                {hasPhoto !== false && (stylizedAvatarUrl || effectiveSelfieUrl) ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={stylizedAvatarUrl || effectiveSelfieUrl!}
                      alt="Your starting point"
                      className="w-full h-full object-contain"
                      style={{ filter: stylizedAvatarUrl ? "brightness(0.7)" : "brightness(0.6) saturate(0.9)" }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-end pb-6 px-4 text-center">
                      {stylizedAvatarStatus === "generating" && (
                        <div
                          className="flex items-center gap-2 px-3 py-1 rounded-full mb-2"
                          style={{ background: "var(--gold-dim)", border: "1px solid var(--border-gold)" }}
                        >
                          <Loader2 size={11} className="spin" style={{ color: "var(--gold)" }} />
                          <span style={{ color: "var(--gold)", fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                            Stylizing your avatar...
                          </span>
                        </div>
                      )}
                      <div
                        className="px-3 py-1 rounded-full mb-2"
                        style={{ background: "var(--gold-dim)", border: "1px solid var(--border-gold)", color: "var(--gold)", fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        {stylizedAvatarUrl ? "Your avatar" : "Your starting point"}
                      </div>
                      {stylizedAvatarStatus !== "generating" && (
                        <button
                          onClick={refreshAvatar}
                          disabled={refreshingAvatar}
                          className="mt-2 text-xs flex items-center gap-1"
                          style={{ background: "rgba(20,14,10,0.55)", border: "1px solid var(--border-gold)", color: "#f3e8d4", borderRadius: 999, padding: "0.3rem 0.7rem", cursor: "pointer" }}
                          title="Regenerate a realistic photo of you in your latest outfit (~5 credits)"
                        >
                          <RefreshCw size={11} /> {refreshingAvatar ? "Refreshing…" : "Refresh my avatar"}
                        </button>
                      )}
                      {!taskHintSeen && (
                        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                          You can navigate away — task keeps running
                        </div>
                      )}
                    </div>
                  </>
                ) : selfiesLoaded ? (
                  <div className="flex items-center justify-center h-full text-center px-4" style={{ color: "var(--text-dim)" }}>
                    <div>
                      <UserIcon size={28} className="mx-auto mb-2" />
                      <div className="text-sm font-medium" style={{ color: "var(--text)" }}>Set up your avatar</div>
                      <div className="text-xs mt-1">
                        Add a selfie (and optionally a full-body photo) in{" "}
                        <Link href="/settings" style={{ color: "var(--gold)" }}>Settings</Link>{" "}
                        to use the Studio and Aria&apos;s manifest.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full shimmer" />
                )}
                </div>
              </div>
          )}

          {/* N2 — Previous try-ons strip (idle only — hidden when result is showing) */}
          {recentTryOns.length > 0 && !generating && !resultUrl && (
            <div className="surface p-3 mt-3">
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
                Previous try-ons · click to view
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {recentTryOns.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setLightboxUrl(r.event_scene_url || r.result_image_url)}
                    style={{ padding: 0, background: "none", border: "1px solid var(--border)", cursor: "pointer", flexShrink: 0 }}
                    title={r.event_context || r.prompt_used || "Past try-on"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.event_scene_url || r.result_image_url}
                      alt={r.event_context || r.prompt_used || "Past try-on"}
                      style={{ width: 52, height: 52, objectFit: "cover", display: "block" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {resultUrl && !generating && (activeTryOn?.itemImageUrls?.length ?? 0) > 0 && (
            <div className="surface p-3 mt-3">
              <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                Items in this look — click one to try it alone
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {activeTryOn!.itemImageUrls.map((u, i) => {
                  const match = items.find((w) => w.image_url === u);
                  return (
                    <button
                      key={i}
                      className="shrink-0 text-center"
                      style={{ width: 56, background: "none", border: "none", padding: 0, cursor: match ? "pointer" : "default" }}
                      title={match ? `Try "${match.name}" alone` : (activeTryOn!.itemNames?.[i] || "")}
                      onClick={() => {
                        if (!match) return;
                        setSelected([match.id]);
                        reset();
                        toast.info(`Selected "${match.name}" — click Manifest to try it alone.`);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="object-cover" style={{ width: 56, height: 56, borderRadius: 8, border: "1px solid var(--border)" }} />
                      <div className="truncate text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
                        {activeTryOn!.itemNames?.[i] || ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 flex flex-col gap-2 lg:overflow-y-auto lg:min-h-0">
          <div className="surface p-4">
            <div className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Selected ({selectedItems.length}/2)
            </div>
            {selectedItems.length === 0 ? (
              <p className="text-xs mb-3" style={{ color: "var(--text-dim)" }}>None yet.</p>
            ) : (
              <div className="space-y-2 mb-3">
                {selectedItems.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 text-xs px-2 py-1.5"
                    style={{ background: "var(--gold-dim)", border: "1px solid var(--border-gold)", borderRadius: 8 }}
                  >
                    <div className="relative flex-shrink-0" style={{ width: 32, height: 32, borderRadius: 6, overflow: "hidden" }}>
                      <Image src={it.image_url} alt={it.name} fill className="object-cover" sizes="32px" />
                    </div>
                    <span className="truncate flex-1">{it.name}</span>
                    <button
                      onClick={() => setSelected(selectedItemIds.filter((x) => x !== it.id))}
                      aria-label={`Remove ${it.name}`}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", flexShrink: 0, padding: 2, lineHeight: 1 }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Try-on model</div>
            <select className="input mb-1" value={tryonModel} onChange={(e) => setTryonModel(e.target.value)}
                    style={{ fontSize: "0.85rem" }}>
              {TRYON_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label} — {m.tier}</option>
              ))}
            </select>
            <div className="text-[10px] mb-3" style={{ color: "var(--text-dim)" }}>
              {TRYON_MODELS.find((m) => m.id === tryonModel)?.blurb}
            </div>

            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Pose / setting (optional)
            </div>
            <input className="input mb-2" placeholder="e.g. golden hour, garden walk"
                   value={settingInput} onChange={(e) => setSettingInput(e.target.value)}
                   style={{ fontSize: "0.85rem" }} />
            <label className="flex items-center gap-2 mb-3 cursor-pointer" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              <input type="checkbox" checked={enhancePrompt} onChange={(e) => setEnhancePrompt(e.target.checked)} />
              <span>✦ AI-enhance my prompt (try-on + video)</span>
            </label>

            <button className="btn-primary w-full" onClick={generate}
                    disabled={!effectiveSelfieUrl || selectedItems.length === 0 || generating}>
              {generating ? <><Loader2 size={16} className="spin" /> Manifesting</> : <><Sparkles size={16} /> Manifest This Look</>}
            </button>
            {generating && (
              <button className="btn-secondary w-full mt-2" onClick={() => { cancelTryOn(); toast.info("Generation cancelled."); }} style={{ padding: "0.5rem 1rem" }}>
                <X size={14} /> Cancel
              </button>
            )}
            {selectedItems.length > 0 && !generating && (
              <button className="btn-secondary w-full mt-2" onClick={() => { clearSelected(); reset(); }} style={{ padding: "0.5rem 1rem" }}>
                Clear & reset
              </button>
            )}
            <button className="btn-secondary w-full mt-2" onClick={() => setShowCompare((v) => !v)} disabled={!resultUrl || !avatarSelfieUrl}>
              <ArrowLeftRight size={14} /> {showCompare ? "Hide before/after" : "Before / After"}
            </button>
          </div>

          <>
            <div className="surface p-4">
              <div className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Place in event</div>
              <input className="input mb-2" placeholder="e.g. beach wedding"
                     value={eventInput} onChange={(e) => setEventInput(e.target.value)}
                     disabled={!resultUrl} />
              <button className="btn-secondary w-full" onClick={() => generateEventScene(eventInput)}
                      disabled={!resultUrl || !eventInput.trim() || eventLoading}>
                {eventLoading ? <Loader2 size={14} className="spin" /> : <MapPin size={14} />}
                {eventLoading ? "Placing..." : "Place in scene"}
              </button>
              {(eventLoading || eventUrl) && (
                <div className="mt-2">
                  <ProgressBar
                    status={eventLoading ? "running" : "complete"}
                    estimatedSeconds={25}
                    label="Placing in scene"
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-3">
                {EVENT_PRESETS.map((p) => (
                  <button key={p} className="chip" onClick={() => { setEventInput(p); generateEventScene(p); }}
                          disabled={!resultUrl || eventLoading} style={{ fontSize: "0.7rem", padding: "0.2rem 0.6rem" }}>
                    {p.split(",")[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="surface p-4">
              <div className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Animate your current scene</div>
              {eventUrl && (
                <div className="text-[11px] mb-2" style={{ color: "var(--gold)" }}>
                  Using placed scene: {eventInput || "current scene"}
                </div>
              )}

              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Video model</div>
              <select className="input mb-1" value={videoModel} onChange={(e) => setVideoModel(e.target.value)}
                      style={{ fontSize: "0.85rem" }}>
                {VIDEO_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} — {m.tier}</option>
                ))}
              </select>
              <div className="text-[10px] mb-3" style={{ color: "var(--text-dim)" }}>
                {VIDEO_MODELS.find((m) => m.id === videoModel)?.blurb}
              </div>

              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Motion</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {MOTION_PRESETS.map((p) => (
                  <button key={p.label} className={`chip ${motionPrompt === p.prompt ? "chip-active" : ""}`}
                          onClick={() => setMotionPrompt(p.prompt)} disabled={animating}
                          style={{ fontSize: "0.7rem", padding: "0.2rem 0.6rem" }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input className="input mb-3" placeholder="Describe the motion (optional)"
                     value={motionPrompt} onChange={(e) => setMotionPrompt(e.target.value)}
                     style={{ fontSize: "0.8rem" }} disabled={animating} />

              <button className="btn-primary w-full" onClick={animate} disabled={animating}>
                {animating ? <><Loader2 size={14} className="spin" /> Rendering (~60s)</> : <><Film size={14} /> Animate (6s video)</>}
              </button>
            </div>
          </>

          {resultUrl && (
            <div className="surface p-4 space-y-2">
              <button className="btn-primary w-full" onClick={() => setShowSaveDialog(true)}>
                <Save size={14} /> Save as outfit
              </button>
              <button className="btn-secondary w-full" onClick={saveTryOnOnly} disabled={!resultId}>
                <Save size={14} /> Save to gallery
              </button>
              <button className="btn-secondary w-full" onClick={() => setShowShare(true)} disabled={!resultId}>
                <Share2 size={14} /> Share with friend
              </button>
              <button
                className="btn-secondary w-full"
                onClick={() => downloadWithWatermark(eventUrl || resultUrl!)}
                disabled={!resultUrl}
              >
                <Download size={14} /> Download look
              </button>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Lightbox for historical try-ons */}
      {lightboxUrl && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(8,8,13,0.92)", zIndex: 200 }}
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Previous try-on"
              style={{ maxHeight: "88vh", maxWidth: "90vw", display: "block", objectFit: "contain" }}
            />
            <button
              onClick={() => setLightboxUrl(null)}
              style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(8,8,13,0.7)", border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff", padding: "4px 10px", cursor: "pointer", fontSize: "0.8rem",
              }}
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}

      {showShare && resultId && (
        <ShareToFriendModal
          target={{
            tryon_id: resultId,
            preview_image_url: eventUrl || resultUrl || undefined,
            label: selectedItems.map((i) => i.name).join(" + ") || "Try-on",
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      <PromptDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        title="Name this outfit"
        description="Pick a name you'll recognize later in your Outfits tab."
        placeholder={selectedItems.map((i) => i.name).join(" + ").slice(0, 60) || "My new outfit"}
        defaultValue={selectedItems.map((i) => i.name).join(" + ").slice(0, 60)}
        confirmLabel="Save outfit"
        onSubmit={saveOutfit}
      />

      <AddItemModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onAddedMany={handleQuickAddMany}
        compact
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Remove this item?"
        description={pendingDelete?.name}
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (pendingDelete) performDelete(pendingDelete.id); setPendingDelete(null); }}
      />
    </div>
  );
}
