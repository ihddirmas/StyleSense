"use client";
import { FEATURES } from "@/lib/features";
import { ProfileHero } from "./ProfileHero";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAppStore } from "@/store/app";
import { useTasks } from "@/store/tasks";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "@/components/ui/Toast";
import { OnboardingHero } from "./OnboardingHero";

export function HeroVideo() {
  if (!FEATURES.heroVideo) {
    return <ProfileHero />;
  }

  const { user, profile } = useAuth();
  const {
    avatarSelfieUrl,
    stylizedAvatarUrl,
    stylizedVideoUrl,
    stylizedVideoStatus,
    setStylized,
    setStylizedVideo,
    ariaVideoUrl,
    ariaImageUrl,
    ariaName,
    setAria,
    hydrated,
  } = useAppStore();
  const [triggering, setTriggering] = useState(false);
  const [ariaLoading, setAriaLoading] = useState(!(ariaVideoUrl || ariaImageUrl));
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>("16/9");

  // Initialize stylized still + video from profile on auth load.
  useEffect(() => {
    if (!profile) return;
    if (stylizedAvatarUrl === null && profile.stylized_avatar_url) {
      setStylized(profile.stylized_avatar_url, "ready");
    }
    if (stylizedVideoUrl !== null) return;
    if (profile.stylized_avatar_video_url && profile.stylized_avatar_video_status === "ready") {
      setStylizedVideo(profile.stylized_avatar_video_url, "ready");
    } else if (profile.stylized_avatar_video_status === "generating") {
      setStylizedVideo(null, "generating");
    }
  }, [profile, stylizedAvatarUrl, stylizedVideoUrl, setStylized, setStylizedVideo]);

  // Only fetch Aria once — store persists it so subsequent visits are instant.
  useEffect(() => {
    if (ariaVideoUrl || ariaImageUrl) {
      setAriaLoading(false);
      return;
    }
    let cancelled = false;
    setAriaLoading(true);
    apiGet<{ hero_video_url: string | null; image_url: string | null; name: string | null }>(
      "/api/avatar/stylist"
    )
      .then((d) => {
        if (!cancelled) setAria(d.hero_video_url, d.image_url, d.name);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAriaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ariaVideoUrl, ariaImageUrl, setAria]);

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
  const showOnboarding = !avatarSelfieUrl && !ariaLoading && !ariaVideoUrl && !ariaImageUrl;
  const userStillUrl =
    stylizedAvatarUrl || profile?.stylized_avatar_url || avatarSelfieUrl || null;
  const hasHeroMedia = showUser || !!ariaVideoUrl || !!ariaImageUrl;
  const showHeroPlaceholder = !hasHeroMedia && (ariaLoading || !!userStillUrl);

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

  const handleVideoLoad = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.videoWidth && video.videoHeight) {
      const ratio = video.videoWidth / video.videoHeight;
      // Detect if portrait (9:16) vs landscape (16:9)
      if (ratio < 1) {
        setVideoAspectRatio("9/16");
      } else {
        setVideoAspectRatio("16/9");
      }
    }
  };

  // If no selfie AND no Aria fallback, show onboarding CTA instead of empty video container
  if (showOnboarding) {
    return <OnboardingHero />;
  }

  return (
    <div
      className="surface overflow-hidden relative"
      style={{
        width: "100%",
        aspectRatio: videoAspectRatio,
        background: "linear-gradient(180deg, var(--surface2) 0%, var(--bg) 100%)",
      }}
    >
      <AnimatePresence mode="wait">
        {showUser ? (
          <motion.video
            key="user-video"
            src={stylizedVideoUrl!}
            autoPlay loop muted playsInline
            onLoadedMetadata={handleVideoLoad}
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
            onLoadedMetadata={handleVideoLoad}
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
        ) : showHeroPlaceholder ? (
          <motion.div
            key="hero-placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex flex-col items-center justify-center gap-3 px-6"
            style={{ background: "var(--surface2)" }}
          >
            {ariaLoading ? (
              <>
                <div className="hero-shimmer w-full max-w-xs h-2 rounded-full" />
                <div className="hero-shimmer w-full max-w-sm h-40 sm:h-48 rounded-lg" />
                <p className="text-xs text-muted flex items-center gap-2">
                  <Loader2 size={14} className="spin" />
                  Loading your runway...
                </p>
              </>
            ) : userStillUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={userStillUrl}
                  alt="Your avatar"
                  className="max-h-[70%] max-w-[85%] object-contain rounded-lg"
                  style={{ filter: stylizedAvatarUrl || profile?.stylized_avatar_url ? "none" : "brightness(0.92)" }}
                />
                <p className="text-xs text-muted text-center max-w-xs">
                  {generating
                    ? "Your ramp video is generating — Aria will step aside when it is ready."
                    : canBackfill
                      ? "Generate a ramp video to star on your dashboard."
                      : "Your runway preview"}
                </p>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Top-left badge: who is on screen */}
      <div className="hero-badge absolute top-3 left-3 sm:top-4 sm:left-4">
        <Sparkles size={10} className="sm:w-3 text-gold" />
        <span className="hero-badge-label">{showUser ? "You" : "Aria"}</span>
      </div>

      {/* Bottom-right pill: "creating yours..." while user video generates */}
      <AnimatePresence>
        {generating && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="status-pill status-pill-dark absolute bottom-3 right-3 sm:bottom-4 sm:right-4"
          >
            <Loader2 size={11} className="sm:w-3 spin text-gold" />
            <span>Generating... 60s</span>
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
            className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full flex items-center gap-1.5 sm:gap-2 text-2xs sm:text-xs font-semibold"
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
