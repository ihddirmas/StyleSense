"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, MessageCircle, Plus, X } from "lucide-react";
import { StyleInsightCard } from "@/components/dashboard/StyleInsightCard";
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
  const { cachedWardrobe, cachedRecent, setCachedWardrobe, setCachedRecent } = useAppStore();
  const [items, setItems] = useState<WardrobeItem[]>(cachedWardrobe);
  const [recent, setRecent] = useState<TryOnResult[]>(cachedRecent);
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
      apiGet<TryOnResult[]>(`/api/tryon/recent?all=true`),
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-4 pb-6 max-w-3xl">

          <h1 className="font-display text-3xl md:text-4xl leading-tight">
            Your Digital Runway
          </h1>

          {/* First-run welcome hint */}
          {!hintSeen && !hintDismissed && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 mt-2 max-w-lg"
            >
              <p className="flex-1 text-sm" style={{ color: "var(--text-muted)" }}>
                Add items to your Wardrobe, then head to Studio to try them on your avatar.
              </p>
              <button
                onClick={() => setHintDismissed(true)}
                aria-label="Dismiss hint"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: "2px", flexShrink: 0, lineHeight: 1 }}
              >
                <X size={14} />
              </button>
            </motion.div>
          )}

          {/* Stats row */}
          {(items.length > 0 || recent.length > 0) ? (
            <div className="flex items-center gap-3 flex-wrap -mt-1">
              {items.length > 0 && (
                <span className="font-mono text-xs" style={{ color: "var(--text-dim)" }}>
                  {items.length} items
                </span>
              )}
              {categoryCount > 0 && (
                <>
                  <span style={{ color: "var(--border)" }}>·</span>
                  <span className="font-mono text-xs" style={{ color: "var(--text-dim)" }}>
                    {categoryCount} {categoryCount === 1 ? "category" : "categories"}
                  </span>
                </>
              )}
              {recent.length > 0 && (
                <>
                  <span style={{ color: "var(--border)" }}>·</span>
                  <span className="font-mono text-xs" style={{ color: "var(--text-dim)" }}>
                    {recent.length} saved {recent.length === 1 ? "look" : "looks"}
                  </span>
                </>
              )}
            </div>
          ) : null}

          {/* Style insight — signals appear immediately, Claude text slots in when ready */}
          <StyleInsightCard insight={insight} items={items} recent={recent} />

          {/* Hero ramp video */}
          <HeroVideo />

          {/* Recent try-ons — auto-advancing carousel */}
          {fetchError ? (
            <div className="text-sm" style={{ color: "var(--text-dim)" }}>
              Couldn&apos;t load your wardrobe.{" "}
              <button
                onClick={() => setRetryKey(k => k + 1)}
                style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0 }}
              >
                Retry
              </button>
            </div>
          ) : recent.length > 0 ? (
            <div>
              <h3
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: "var(--text-dim)" }}
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

          {/* Shortcut cards — always visible */}
          <div className={`grid gap-3 ${recent.length > 0 ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`}>
            <ActionCard
              href="/wardrobe"
              icon={<Plus size={18} />}
              title="Add to closet"
              desc={recent.length > 0 ? undefined : "Upload a photo or paste a product URL."}
            />
            <ActionCard
              href="/studio"
              icon={<Sparkles size={18} />}
              title="Try on an outfit"
              desc={recent.length > 0 ? undefined : "Compose a look and see it on your avatar."}
            />
            <ActionCard
              href="/stylist"
              icon={<MessageCircle size={18} />}
              title="Ask your stylist"
              desc={recent.length > 0 ? undefined : "Get item picks for your next event."}
            />
          </div>
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
      className="surface surface-hover block"
      style={{
        textDecoration: "none",
        color: "inherit",
        padding: desc ? "20px" : "12px 16px",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: desc ? 36 : 28,
            height: desc ? 36 : 28,
            background: "var(--surface2)",
            color: "var(--ink)",
            border: "1px solid var(--border)",
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className={`font-display leading-tight ${desc ? "text-xl" : "text-base"}`}>{title}</div>
          {desc && <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>}
        </div>
      </div>
    </Link>
  );
}
