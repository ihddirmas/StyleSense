"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, MessageCircle, Plus, X } from "lucide-react";
import { StyleInsightCard } from "@/components/dashboard/StyleInsightCard";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import { ContinueCard } from "@/components/dashboard/ContinueCard";
import { useSeenOnce } from "@/lib/useSeenOnce";
import type { TryOnResult } from "@/types";
import { HeroVideo } from "@/components/dashboard/HeroVideo";
import { TryOnCarousel } from "@/components/dashboard/TryOnCarousel";
import { useAuth } from "@/components/AuthProvider";
import { useAppStore } from "@/store/app";
import { apiGet } from "@/lib/api";
import type { WardrobeItem } from "@/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const { cachedWardrobe, cachedRecent, setCachedWardrobe, setCachedRecent, avatarSelfieUrl } = useAppStore();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [recent, setRecent] = useState<TryOnResult[]>([]);

  // Populate from persisted cache after hydration (avoids SSR mismatch)
  useEffect(() => {
    if (cachedWardrobe.length) setItems(cachedWardrobe);
    if (cachedRecent.length) setRecent(cachedRecent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [insight, setInsight] = useState<string | null>(null);
  const hintSeen = useSeenOnce("dashboard-welcome");

  useEffect(() => {
    if (!user) return;

    // Serve cached insight instantly while the fresh call runs in the background
    const cacheKey = `si_${user.id}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { text, ts } = JSON.parse(raw);
        if (Date.now() - ts < 6 * 3600 * 1000) setInsight(text);
      }
    } catch {}

    setFetchError(false);
    Promise.allSettled([
      apiGet<WardrobeItem[]>(`/api/wardrobe`),
      apiGet<TryOnResult[]>(`/api/tryon/recent?all=true&limit=100`),
    ]).then(([wardrobeRes, recentRes]) => {
      if (wardrobeRes.status === "fulfilled") {
        setItems(wardrobeRes.value);
        setCachedWardrobe(wardrobeRes.value);
      } else setFetchError(true);
      if (recentRes.status === "fulfilled") {
        const s = recentRes.value.slice(0, 10);
        setRecent(s);
        setCachedRecent(s);
      } else setFetchError(true);
    });

    // Insight: fire in parallel, never blocks loading state
    apiGet<{ insight: string | null }>(`/api/stylist/insight`)
      .then(d => {
        if (d.insight) {
          setInsight(d.insight);
          try { localStorage.setItem(cacheKey, JSON.stringify({ text: d.insight, ts: Date.now() })); } catch {}
        }
      })
      .catch(() => {});
  }, [user, retryKey]);

  const categoryCount = new Set(items.map(i => i.category)).size;

  const triedItemIds = new Set(
    recent.filter(r => r.status === "done" && r.wardrobe_item_id).map(r => r.wardrobe_item_id)
  );
  const continueItem = [...items]
    .filter(i => !triedItemIds.has(i.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-4 md:gap-5 pb-8 max-w-6xl mx-auto px-4 sm:px-6 md:px-8">

        {/* Header row: title + inline stats */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl leading-tight">
            Your Digital Runway
          </h1>
          {(items.length > 0 || recent.length > 0) && (
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap pb-0 sm:pb-1 text-xs sm:text-xs">
              {items.length > 0 && (
                <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                  {items.length} items
                </span>
              )}
              {categoryCount > 0 && (
                <>
                  <span style={{ color: "var(--border-hover)" }}>·</span>
                  <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                    {categoryCount} {categoryCount === 1 ? "category" : "categories"}
                  </span>
                </>
              )}
              {recent.length > 0 && (
                <>
                  <span style={{ color: "var(--border-hover)" }}>·</span>
                  <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                    {recent.length} saved {recent.length === 1 ? "look" : "looks"}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* First-run welcome hint */}
        {!hintSeen && !hintDismissed && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 -mt-1 md:-mt-2"
          >
            <p className="flex-1 text-xs sm:text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {avatarSelfieUrl
                ? "Add items to your Wardrobe, then head to Studio to try them on your avatar."
                : "Start by uploading a selfie in Settings, then add clothes to your Wardrobe."}
            </p>
            <button
              onClick={() => setHintDismissed(true)}
              aria-label="Dismiss hint"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", flexShrink: 0, lineHeight: 1 }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}

        {/* Hero + Insight: side-by-side on lg+, stacked below */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 md:gap-5">
          <HeroVideo />
          <div className="flex flex-col gap-3 md:gap-4">
            <StyleInsightCard insight={insight} items={items} recent={recent} />
            <UsageMeter />
            {continueItem && <ContinueCard item={continueItem} />}
            <div className="flex flex-col gap-2">
              <ActionCard href="/wardrobe" icon={<Plus size={16} />} title="Add to closet" />
              <ActionCard href="/studio" icon={<Sparkles size={16} />} title="Try on an outfit" />
              <ActionCard href="/stylist" icon={<MessageCircle size={16} />} title="Ask your stylist" />
            </div>
          </div>
        </div>

        {/* Recent try-ons */}
        {fetchError ? (
          <div className="text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>
            Couldn&apos;t load your wardrobe.{" "}
            <button
              onClick={() => setRetryKey(k => k + 1)}
              style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0 }}
            >
              Retry
            </button>
          </div>
        ) : recent.length > 0 ? (
          <div className="w-full sm:max-w-lg">
            <h3
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              Recent Try-Ons
            </h3>
            <TryOnCarousel
              results={recent}
              aspect="4/5"
              onOpen={(r) => setLightboxUrl(r.event_scene_url || r.result_image_url)}
            />
          </div>
        ) : null}


        {/* Lightbox */}
        <AnimatePresence>
          {lightboxUrl && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center"
              style={{ background: "rgba(8,8,13,0.92)", zIndex: 200 }}
              onClick={() => setLightboxUrl(null)}
            >
              <button
                onClick={() => setLightboxUrl(null)}
                style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}
              >
                <X size={22} />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt="Try-on"
                style={{ maxHeight: "88vh", maxWidth: "90vw", objectFit: "contain" }}
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


function ActionCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc?: string;
}) {
  return (
    <Link
      href={href}
      className={`surface surface-hover block ${desc ? "p-4" : "p-3"}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <div
          className="flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            width: desc ? 32 : 28,
            height: desc ? 32 : 28,
            background: "var(--surface2)",
            color: "var(--ink)",
            border: "1px solid var(--border-hover)",
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`font-display leading-tight ${desc ? "text-base sm:text-lg" : "text-xs sm:text-sm"}`} style={{ color: "var(--text)" }}>{title}</div>
          {desc && <p className="text-xs mt-1 leading-snug" style={{ color: "var(--text-muted)" }}>{desc}</p>}
        </div>
      </div>
    </Link>
  );
}
