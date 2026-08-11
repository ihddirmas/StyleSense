"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Calendar, Sparkles, Share2, Film, Download, Plus, UserPlus, Loader2, Archive } from "lucide-react";
import type { TryOnResult } from "@/types";
import { ShareToFriendModal } from "@/components/ShareToFriendModal";
import { apiPost } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { PromptDialog } from "@/components/ui/Dialog";

export function TryOnDetailModal({
  result, onClose, sharedBy,
}: {
  result: TryOnResult & { event_scene_url?: string | null; result_video_url?: string | null };
  onClose: () => void;
  sharedBy?: { name: string | null; email: string | null } | null;
}) {
  const [showShare, setShowShare] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const router = useRouter();
  const display = result.b2_image_url || result.event_scene_url || result.result_image_url;
  const hasVideo = !!(result.b2_video_url || result.result_video_url);
  const videoSrc = result.b2_video_url || result.result_video_url;
  const archived = !!(result.b2_image_url || result.image_manifest_hash || result.b2_video_url || result.video_manifest_hash);
  const manifestShort = result.image_manifest_hash?.slice(0, 12);

  async function extractToWardrobe(name: string) {
    setExtracting(true);
    try {
      await apiPost("/api/wardrobe/extract-from-image", {
        image_url: display,
        name,
        category: "tops",
      });
      toast.success(`Saved "${name}" to your wardrobe!`);
      onClose();
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setExtracting(false);
    }
  }

  function useThisFace() {
    // Stash the source image as a "face URL" Studio can read
    if (typeof window !== "undefined") {
      sessionStorage.setItem("studio_borrowed_face", display);
    }
    toast.success(`Using this face for your next try-on. Open Studio.`);
    onClose();
    router.push("/studio");
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center px-4 py-8 overflow-auto"
        style={{ background: "rgba(8,8,13,0.92)", zIndex: 100 }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
          className="surface w-full grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden"
          style={{ maxWidth: 980, maxHeight: "90vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* LEFT: full-size image / video */}
          <div className="relative" style={{ background: "var(--bg)", minHeight: 400 }}>
            {hasVideo ? (
              <video src={videoSrc!} controls autoPlay loop
                     className="w-full h-full object-contain"
                     style={{ maxHeight: "90vh" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={display} alt="Try-on"
                   className="w-full h-full object-contain"
                   style={{ maxHeight: "90vh" }} />
            )}
          </div>

          {/* RIGHT: details + actions */}
          <div className="p-7 flex flex-col" style={{ minHeight: 400, maxHeight: "90vh", overflow: "auto" }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--on-gold)" }}>
                  {sharedBy ? "Shared with you" : "Try-on"}
                </div>
                <h2 className="font-display text-3xl">
                  {sharedBy ? `From ${sharedBy.name || sharedBy.email}` : "Your try-on"}
                </h2>
              </div>
              <button onClick={onClose}
                      style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
                      aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mt-3 mb-5">
              {result.event_context && (
                <span className="chip">
                  <Sparkles size={11} style={{ marginRight: 4 }} /> {result.event_context}
                </span>
              )}
              {result.model_used && <span className="chip">{result.model_used}</span>}
              {hasVideo && <span className="chip"><Film size={11} style={{ marginRight: 4 }} /> Video</span>}
              {archived && (
                <span className="chip" title={result.image_manifest_hash || undefined}>
                  <Archive size={11} style={{ marginRight: 4 }} />
                  B2 archive{manifestShort ? ` · ${manifestShort}…` : ""}
                </span>
              )}
              <span className="chip">
                <Calendar size={11} style={{ marginRight: 4 }} />
                {new Date(result.created_at).toLocaleString(undefined, {
                  month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
                })}
              </span>
            </div>

            {result.prompt_used && (
              <details className="mb-5">
                <summary className="text-xs cursor-pointer" style={{ color: "var(--text-muted)" }}>
                  View generation prompt
                </summary>
                <p className="text-xs mt-2 p-3 rounded-sm" style={{ background: "var(--bg)", color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                  {result.prompt_used}
                </p>
              </details>
            )}

            <div className="mt-auto pt-5 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
              {!sharedBy && (
                <button className="btn-primary w-full" onClick={() => { onClose(); router.push("/studio"); }}>
                  <Sparkles size={14} /> Open in Studio
                </button>
              )}

              {sharedBy && (
                <>
                  <button
                    className="btn-primary w-full"
                    onClick={() => setShowExtractDialog(true)}
                    disabled={extracting}
                  >
                    {extracting ? <><Loader2 size={14} className="spin" /> Extracting...</> :
                                  <><Plus size={14} /> Save garment to my wardrobe</>}
                  </button>
                  <button className="btn-secondary w-full" onClick={useThisFace}>
                    <UserPlus size={14} /> Use {sharedBy.name?.split(" ")[0] || "their"} face on my dress
                  </button>
                </>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={() => setShowShare(true)}>
                  <Share2 size={14} /> {sharedBy ? "Share onward" : "Share"}
                </button>
                <a className="btn-secondary"
                   href={hasVideo ? result.result_video_url! : display}
                   download
                   target="_blank" rel="noreferrer"
                   style={{ textDecoration: "none" }}>
                  <Download size={14} /> Download
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {showShare && (
        <ShareToFriendModal
          target={{
            tryon_id: result.id,
            preview_image_url: display,
            label: result.event_context || "Try-on",
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      <PromptDialog
        open={showExtractDialog}
        onClose={() => setShowExtractDialog(false)}
        title="Save this garment to your wardrobe?"
        description="We'll use Runway to isolate the clothing from this image and add it to your wardrobe."
        placeholder="e.g. Gold sequin gown"
        defaultValue={(result.event_context || "Inspired item").slice(0, 60)}
        confirmLabel={extracting ? "Extracting..." : "Save to wardrobe"}
        onSubmit={extractToWardrobe}
      />
    </>
  );
}
