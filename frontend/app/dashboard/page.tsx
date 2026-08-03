"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { StyleInsightCard } from "@/components/dashboard/StyleInsightCard";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import { ContinueCard } from "@/components/dashboard/ContinueCard";
import { DashboardEmptyPanel } from "@/components/dashboard/DashboardEmptyPanel";
import { WardrobeFetchError } from "@/components/dashboard/WardrobeFetchError";
import { useSeenOnce } from "@/lib/useSeenOnce";
import type { TryOnResult } from "@/types";
import { HeroVideo } from "@/components/dashboard/HeroVideo";
import { TryOnCarousel } from "@/components/dashboard/TryOnCarousel";
import { useAuth } from "@/components/AuthProvider";
import { useAppStore } from "@/store/app";
import { apiGet } from "@/lib/api";
import type { WardrobeItem } from "@/types";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

export default function DashboardPage() {
  const { user } = useAuth();
  const { cachedWardrobe, cachedRecent, setCachedWardrobe, setCachedRecent, avatarSelfieUrl } = useAppStore();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [recent, setRecent] = useState<TryOnResult[]>([]);

  useEffect(() => {
    if (cachedWardrobe.length) setItems(cachedWardrobe);
    if (cachedRecent.length) setRecent(cachedRecent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [loading, setLoading] = useState(() => cachedWardrobe.length === 0);
  const [retryKey, setRetryKey] = useState(0);
  const [insight, setInsight] = useState<string | null>(null);
  const [atCap, setAtCap] = useState(false);
  const hintSeen = useSeenOnce("dashboard-welcome");

  useEffect(() => {
    if (!user) return;

    const cacheKey = `si_${user.id}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { text, ts } = JSON.parse(raw);
        if (Date.now() - ts < 6 * 3600 * 1000) setInsight(text);
      }
    } catch {}

    setFetchError(false);
    if (!cachedWardrobe.length) setLoading(true);

    Promise.allSettled([
      apiGet<WardrobeItem[]>(`/api/wardrobe`),
      apiGet<TryOnResult[]>(`/api/tryon/recent?all=true&limit=100`),
    ]).then(([wardrobeRes, recentRes]) => {
      const wardrobeCache = useAppStore.getState().cachedWardrobe;

      if (wardrobeRes.status === "fulfilled") {
        setItems(wardrobeRes.value);
        setCachedWardrobe(wardrobeRes.value);
      } else if (!wardrobeCache.length) {
        setFetchError(true);
      }

      if (recentRes.status === "fulfilled") {
        setRecent(recentRes.value);
        setCachedRecent(recentRes.value);
      } else if (!useAppStore.getState().cachedRecent.length && wardrobeRes.status !== "fulfilled" && !wardrobeCache.length) {
        setFetchError(true);
      }

      setLoading(false);
    });

    apiGet<{ tryon: { used: number; limit: number } }>(`/api/tryon/usage-status`)
      .then(d => setAtCap(d.tryon.used >= d.tryon.limit))
      .catch(() => {});

    apiGet<{ insight: string | null }>(`/api/stylist/insight`)
      .then(d => {
        if (d.insight) {
          setInsight(d.insight);
          try { localStorage.setItem(cacheKey, JSON.stringify({ text: d.insight, ts: Date.now() })); } catch {}
        }
      })
      .catch(() => {});
  }, [user, retryKey, setCachedRecent, setCachedWardrobe]);

  const categoryCount = new Set(items.map(i => i.category)).size;
  const displayRecent = recent.slice(0, 10);

  const triedItemIds = new Set(
    recent.filter(r => r.status === "done" && r.wardrobe_item_id).map(r => r.wardrobe_item_id)
  );
  const continueItem = [...items]
    .filter(i => !triedItemIds.has(i.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const showEmptyPanel = !loading && items.length === 0;
  const showStaleBanner = fetchError && items.length > 0;

  const statsAction =
    items.length > 0 || displayRecent.length > 0 ? (
      <div className="page-stats pb-0 sm:pb-1">
        {items.length > 0 && <span>{items.length} items</span>}
        {categoryCount > 0 && (
          <>
            <span className="page-stats-sep">·</span>
            <span>
              {categoryCount} {categoryCount === 1 ? "category" : "categories"}
            </span>
          </>
        )}
        {displayRecent.length > 0 && (
          <>
            <span className="page-stats-sep">·</span>
            <span>
              {displayRecent.length} saved {displayRecent.length === 1 ? "look" : "looks"}
            </span>
          </>
        )}
      </div>
    ) : null;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Home"
        title="Your Style Intelligence"
        titleSize="responsive"
        action={statsAction}
      />

      {showStaleBanner && (
        <WardrobeFetchError onRetry={() => setRetryKey(k => k + 1)} variant="stale" />
      )}

      {!hintSeen && !hintDismissed && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-start gap-2 -mt-2"
        >
          <p className="flex-1 text-xs sm:text-sm leading-relaxed text-muted">
            {avatarSelfieUrl
              ? "Add items or paste a URL in Aria — get a verdict grounded in your color season and Kibbe type."
              : "Start onboarding: face + full-body photos for your color season and Kibbe profile."}
          </p>
          <button
            type="button"
            onClick={() => setHintDismissed(true)}
            aria-label="Dismiss hint"
            className="icon-btn shrink-0"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}

      {showEmptyPanel ? (
        <>
          <HeroVideo />
          <DashboardEmptyPanel
            fetchError={fetchError}
            onRetry={() => setRetryKey(k => k + 1)}
          />
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 md:gap-5">
          <HeroVideo />
          <div className="flex flex-col gap-3 md:gap-4">
            <StyleInsightCard insight={insight} items={items} recent={recent} />
            <UsageMeter />
            {continueItem && !atCap && <ContinueCard item={continueItem} />}
          </div>
        </div>
      )}

      {!fetchError && displayRecent.length > 0 && (
        <div className="w-full sm:max-w-lg">
          <h2 className="section-label mb-3">Recent Try-Ons</h2>
          <TryOnCarousel
            results={displayRecent}
            aspect="4/5"
            onOpen={(r) => setLightboxUrl(r.event_scene_url || r.result_image_url)}
          />
        </div>
      )}

      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-[200]"
            style={{ background: "rgba(8,8,13,0.92)" }}
            onClick={() => setLightboxUrl(null)}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 icon-btn text-white hover:text-white hover:bg-white/10"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Try-on"
              className="object-contain max-h-[88vh] max-w-[90vw]"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}
