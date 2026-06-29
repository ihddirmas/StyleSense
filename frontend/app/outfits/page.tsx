"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Calendar, Share2, Eye, Trash2, Sparkles, Tag } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiGet, apiDelete } from "@/lib/api";
import { ShareToFriendModal } from "@/components/ShareToFriendModal";
import { OutfitDetailModal } from "@/components/OutfitDetailModal";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { toast } from "@/components/ui/Toast";
import type { Outfit } from "@/types";

export default function OutfitsPage() {
  const { user } = useAuth();
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareTarget, setShareTarget] = useState<Outfit | null>(null);
  const [openOutfit, setOpenOutfit] = useState<Outfit | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Outfit | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiGet<Outfit[]>(`/api/outfits`)
      .then(setOutfits)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function performDelete(outfit: Outfit) {
    setDeleting(true);
    try {
      await apiDelete(`/api/outfits/${outfit.id}`);
      setOutfits((prev) => prev.filter((o) => o.id !== outfit.id));
      toast.success("Outfit deleted.");
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <PageHeader
        eyebrow="Outfits"
        title="Saved Looks"
        tutorialKey="outfits"
        subtitle="Every outfit you save from Studio or Aria lives here. Click any card to view items, re-try, or share."
        action={
          <Link
            href="/studio"
            className="surface surface-hover px-4 py-2 text-sm flex items-center gap-2"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <Sparkles size={14} style={{ color: "var(--gold)" }} />
            New look
          </Link>
        }
      />

      {loading ? (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))" }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="shimmer"
              style={{ aspectRatio: "3/4", background: "var(--surface2)" }}
            />
          ))}
        </div>
      ) : outfits.length === 0 ? (
        <div className="surface p-12 text-center flex-1" style={{ color: "var(--text-muted)" }}>
          <Layers size={32} className="mx-auto mb-3" style={{ color: "var(--text-dim)" }} />
          <p className="text-sm mb-4">No saved outfits yet.</p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Generate a try-on in Studio and click &ldquo;Save outfit&rdquo;, or ask Aria to manifest a look.
          </p>
          <Link
            href="/studio"
            className="btn-primary inline-flex mt-5"
            style={{ fontSize: "0.85rem", padding: "0.55rem 1.2rem" }}
          >
            <Sparkles size={14} /> Open Studio
          </Link>
        </div>
      ) : (
        <div
          className="grid gap-3 pb-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))" }}
        >
          <AnimatePresence>
            {outfits.map((o, i) => (
              <OutfitCard
                key={o.id}
                outfit={o}
                index={i}
                onOpen={() => setOpenOutfit(o)}
                onShare={() => setShareTarget(o)}
                onDelete={() => setPendingDelete(o)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {shareTarget && (
          <ShareToFriendModal
            target={{
              outfit_id: shareTarget.id,
              preview_image_url: shareTarget.preview_image_url || undefined,
              label: shareTarget.name,
            }}
            onClose={() => setShareTarget(null)}
          />
        )}
        {openOutfit && (
          <OutfitDetailModal
            outfit={openOutfit}
            onClose={() => setOpenOutfit(null)}
            onDeleted={(id) => setOutfits((prev) => prev.filter((o) => o.id !== id))}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete this outfit?"
        description={pendingDelete ? `"${pendingDelete.name}" will be removed. The wardrobe items stay.` : ""}
        confirmLabel={deleting ? "Deleting…" : "Delete outfit"}
        destructive
        onConfirm={async () => { if (pendingDelete) await performDelete(pendingDelete); }}
      />
    </div>
  );
}

function OutfitCard({
  outfit, index, onOpen, onShare, onDelete,
}: {
  outfit: Outfit;
  index: number;
  onOpen: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.035 }}
      className="flex flex-col"
    >
      {/* Image card */}
      <button
        onClick={onOpen}
        className="overflow-hidden group relative text-left w-full"
        style={{
          padding: 0,
          cursor: "pointer",
          color: "inherit",
          background: "var(--bg)",
          border: "1.5px solid var(--border)",
        }}
      >
        {outfit.preview_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={outfit.preview_image_url}
            alt={outfit.name}
            className="w-full object-cover"
            style={{ aspectRatio: "3/4", display: "block" }}
          />
        ) : (
          <div
            className="flex items-center justify-center w-full"
            style={{ aspectRatio: "3/4", background: "var(--surface2)" }}
          >
            <Layers size={24} style={{ color: "var(--text-dim)" }} />
          </div>
        )}

        {/* Hover gradient + view badge */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition flex items-end justify-center pb-3"
          style={{
            background: "linear-gradient(to top, rgba(8,8,13,0.78) 0%, transparent 55%)",
            pointerEvents: "none",
          }}
        >
          <div
            className="flex items-center gap-1 px-3 py-1 text-xs font-semibold"
            style={{ background: "var(--ink)", color: "var(--parchment)" }}
          >
            <Eye size={11} /> View
          </div>
        </div>

        {/* Share button — top right */}
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onShare(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onShare(); } }}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition p-1.5 cursor-pointer"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
          aria-label="Share"
          title="Share"
        >
          <Share2 size={11} />
        </div>

        {/* Delete button — top left */}
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDelete(); } }}
          className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition p-1.5 cursor-pointer"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--red)" }}
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 size={11} />
        </div>
      </button>

      {/* Footer */}
      <div className="pt-1.5 px-0.5">
        <div className="font-display text-sm leading-tight truncate">{outfit.name}</div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span
            className="font-mono text-[9px] px-1.5 py-0.5"
            style={{ background: "var(--ink)", color: "var(--bg)" }}
          >
            {outfit.item_ids.length} items
          </span>
          {outfit.occasion && (
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 flex items-center gap-0.5 truncate max-w-[80px]"
              style={{ background: "var(--surface3)", color: "var(--text-muted)" }}
            >
              <Tag size={7} /> {outfit.occasion}
            </span>
          )}
          <span className="font-mono text-[9px] flex items-center gap-0.5" style={{ color: "var(--text-dim)" }}>
            <Calendar size={7} />
            {new Date(outfit.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
