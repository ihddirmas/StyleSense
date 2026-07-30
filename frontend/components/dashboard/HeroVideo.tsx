"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAppStore } from "@/store/app";
import { useTasks } from "@/store/tasks";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "@/components/ui/Toast";

export function HeroVideo() {
  const { user, profile } = useAuth();
  const {
    avatarSelfieUrl,
    stylizedVideoUrl,
    stylizedVideoStatus,
    setStylizedVideo,
    ariaVideoUrl,
    ariaImageUrl,
    ariaName,
    setAria,
    hydrated,
  } = useAppStore();
  const [triggering, setTriggering] = useState(false);

  // Initialize stylized video from profile on auth load (avoid polling if already ready)
  useEffect(() => {
    if (!profile || stylizedVideoUrl !== null) return; // already loaded
    if (profile.stylized_avatar_video_url && profile.stylized_avatar_video_status === "ready") {
      setStylizedVideo(profile.stylized_avatar_video_url, "ready");
    } else if (profile.stylized_avatar_video_status === "generating") {
      setStylizedVideo(null, "generating");
    }
  }, [profile, stylizedVideoUrl, setStylizedVideo]);

  // Only fetch Aria once — store persists it so subsequent visits are instant.
  useEffect(() => {
    if (ariaVideoUrl !== null) return;
    apiGet<{ hero_video_url: string | null; image_url: string | null; name: string | null }>(
      "/api/avatar/stylist"
    ).then((d) => setAria(d.hero_video_url, d.image_url, d.name)).catch(() => {});
  }, [ariaVideoUrl, setAria]);

  // Delegate polling to the shared tasks store (dedupes with any watch
  // already running, and surfaces progress/completion in Activity too).
  useEffect(() => {
    if (!user || !hydrated) return;
    if (stylizedVideoStatus === "ready") return;
    useTasks.getState().watchAvatarVideo();
  }, [user, hydrated, stylizedVideoStatus]);

  const showUser = !!stylizedVideoUrl && stylizedVideoStatus === "ready";
  const generating = !!avatarSelfieUrl && stylizedVideoStatus === "generating";
  const canBackfill = !!avatarSelfieUrl && !stylizedVideoUrl && !generating && !triggering;

  async function backfill() {
    setTriggering(true);
    setStylizedVideo(null, "generating" as never);
    try {
      await apiPost("/api/avatar/regenerate-stylized?video=true", {});
      toast.success("Generating your ramp video... ~60 seconds.");
    } catch (e) {
      setStylizedVideo(null, "failed" as never);
      const msg = e instanceof Error ? e.message : "unknown error";
      if (msg.includes("409")) {
        toast.error("You already have a ramp video! (Future: Premium tier will allow regeneration.)");
      } else {
        toast.error(`Could not start: ${msg}`);
      }
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
        className="absolute top-3 left-3 sm:top-4 sm:left-4 px-2 sm:px-3 py-1 rounded-full flex items-center gap-1.5 sm:gap-2"
        style={{
          background: "rgba(8,8,13,0.7)",
          border: "1px solid var(--border-hover)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Sparkles size={10} className="sm:w-3" style={{ color: "var(--gold)" }} />
        <span
          className="text-[10px] sm:text-xs font-semibold tracking-wide"
          style={{ color: "var(--gold)", textTransform: "uppercase" }}
        >
          {showUser ? "You" : "Aria"}
        </span>
      </div>

      {/* Bottom-right pill: "creating yours..." while user video generates */}
      <AnimatePresence>
        {generating && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full flex items-center gap-1.5 sm:gap-2"
            style={{
              background: "rgba(8,8,13,0.75)",
              border: "1px solid var(--border-hover)",
              backdropFilter: "blur(8px)",
            }}
          >
            <Loader2 size={11} className="sm:w-3 spin" style={{ color: "var(--gold)" }} />
            <span className="text-[10px] sm:text-xs font-medium" style={{ color: "var(--gold)" }}>
              Generating... 60s
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
            className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-semibold"
            style={{
              background: "var(--gold)",
              color: "var(--on-gold)",
              border: "1px solid var(--border-hover)",
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
