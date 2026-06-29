"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAppStore } from "@/store/app";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "@/components/ui/Toast";

interface StylizedVideoShape {
  url: string | null;
  status: "idle" | "generating" | "ready" | "failed" | "no_selfie";
}

export function HeroVideo() {
  const { user } = useAuth();
  const {
    avatarSelfieUrl,
    stylizedVideoUrl,
    stylizedVideoStatus,
    setStylizedVideo,
    ariaVideoUrl,
    ariaImageUrl,
    ariaName,
    setAria,
  } = useAppStore();
  const [triggering, setTriggering] = useState(false);

  // Only fetch Aria once — store persists it so subsequent visits are instant.
  useEffect(() => {
    if (ariaVideoUrl !== null) return;
    apiGet<{ hero_video_url: string | null; image_url: string | null; name: string | null }>(
      "/api/avatar/stylist"
    ).then((d) => setAria(d.hero_video_url, d.image_url, d.name)).catch(() => {});
  }, [ariaVideoUrl, setAria]);

  // Only poll stylized-video if it's generating. If already ready, skip the call.
  useEffect(() => {
    if (!user) return;
    if (stylizedVideoStatus === "ready") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const d = await apiGet<StylizedVideoShape>("/api/avatar/stylized-video");
        if (cancelled) return;
        setStylizedVideo(d.url, d.status as never);
        if (d.status === "generating") timer = setTimeout(tick, 5000);
      } catch {
        if (!cancelled) timer = setTimeout(tick, 10000);
      }
    }
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [user, stylizedVideoStatus, setStylizedVideo]);

  const showUser = !!stylizedVideoUrl && stylizedVideoStatus === "ready";
  const generating = !!avatarSelfieUrl && stylizedVideoStatus === "generating";
  const canBackfill = !!avatarSelfieUrl && !stylizedVideoUrl && !generating && !triggering;

  async function backfill() {
    setTriggering(true);
    setStylizedVideo(null, "generating" as never);
    try {
      await apiPost("/api/avatar/regenerate-stylized?video=true", {});
      toast.success("Generating your ramp video... ~60s.");
    } catch (e) {
      setStylizedVideo(null, "failed" as never);
      toast.error(`Could not start: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div
      className="surface overflow-hidden relative"
      style={{
        width: "100%",
        aspectRatio: "16/9",
        background: "linear-gradient(180deg, var(--surface2) 0%, var(--bg) 100%)",
      }}
    >
      <AnimatePresence mode="wait">
        {showUser ? (
          <motion.video
            key="user-video"
            src={stylizedVideoUrl!}
            autoPlay loop muted playsInline
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full h-full object-cover"
          />
        ) : ariaVideoUrl ? (
          <motion.video
            key="aria-video"
            src={ariaVideoUrl}
            autoPlay loop muted playsInline
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full h-full object-cover"
          />
        ) : ariaImageUrl ? (
          <motion.div
            key="aria-still"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex items-center justify-center"
            style={{ background: "var(--surface2)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ariaImageUrl} alt={ariaName || "Stylist"} className="h-full object-contain" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Top-left badge: who is on screen */}
      <div
        className="absolute top-4 left-4 px-3 py-1 rounded-full flex items-center gap-2"
        style={{
          background: "rgba(8,8,13,0.6)",
          border: "1px solid var(--border-gold)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Sparkles size={11} style={{ color: "var(--gold)" }} />
        <span
          className="text-xs"
          style={{ color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          {showUser ? "You on the runway" : "Aria, your stylist"}
        </span>
      </div>

      {/* Bottom-right pill: "creating yours..." while user video generates */}
      <AnimatePresence>
        {generating && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-4 right-4 px-3 py-2 rounded-full flex items-center gap-2"
            style={{
              background: "rgba(8,8,13,0.7)",
              border: "1px solid var(--border-gold)",
              backdropFilter: "blur(8px)",
            }}
          >
            <Loader2 size={12} className="spin" style={{ color: "var(--gold)" }} />
            <span className="text-xs" style={{ color: "var(--text)" }}>
              Creating your ramp video... ~60s
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom-right button: backfill for existing users w/o a video yet */}
      <AnimatePresence>
        {canBackfill && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={backfill}
            disabled={triggering}
            className="absolute bottom-4 right-4 px-3 py-2 rounded-full flex items-center gap-2"
            style={{
              background: "var(--gold)",
              color: "var(--on-gold)",
              border: "1px solid var(--border-gold)",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: triggering ? "not-allowed" : "pointer",
              boxShadow: "0 8px 24px -8px rgba(0,0,0,0.7)",
            }}
          >
            {triggering ? <Loader2 size={12} className="spin" /> : <Wand2 size={12} />}
            Generate my ramp video
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
