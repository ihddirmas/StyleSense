"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { X, Sparkles, Share2, Trash2, Calendar, Tag, Loader2, Layers } from "lucide-react";
import type { Outfit, WardrobeItem } from "@/types";
import { apiGet, apiDelete } from "@/lib/api";
import { useAppStore } from "@/store/app";
import { toast } from "@/components/ui/Toast";
import { ShareToFriendModal } from "@/components/ShareToFriendModal";
import { ConfirmDialog } from "@/components/ui/Dialog";

export function OutfitDetailModal({
  outfit, onClose, onDeleted,
}: {
  outfit: Outfit;
  onClose: () => void;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const { setSelected, selectedItemIds } = useAppStore();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiGet<WardrobeItem[]>("/api/wardrobe")
      .then((all) => setItems(all.filter((i) => outfit.item_ids.includes(i.id))))
      .catch(() => {})
      .finally(() => setLoadingItems(false));
  }, [outfit.item_ids]);

  function tryThisOutfit() {
    const catOf = (id: string) => (items.find((w) => w.id === id)?.category || "").toLowerCase();
    const selected = [...selectedItemIds];

    outfit.item_ids.forEach((id) => {
      const cat = catOf(id);
      if (cat === "accessories") {
        if (!selected.includes(id)) selected.push(id);
      } else if (cat === "dresses") {
        const filtered = selected.filter((x) => !["dresses", "tops", "bottoms"].includes(catOf(x)));
        selected.length = 0;
        selected.push(...filtered, id);
      } else if (cat === "tops" || cat === "bottoms") {
        const filtered = selected.filter((x) => catOf(x) !== cat && catOf(x) !== "dresses");
        selected.length = 0;
        selected.push(...filtered, id);
      } else {
        const filtered = selected.filter((x) => catOf(x) !== cat);
        selected.length = 0;
        selected.push(...filtered, id);
      }
    });

    setSelected(selected.slice(0, 6));
    onClose();
    router.push("/studio");
  }

  async function performDelete() {
    setDeleting(true);
    try {
      await apiDelete(`/api/outfits/${outfit.id}`);
      toast.success("Outfit deleted.");
      onDeleted?.(outfit.id);
      onClose();
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setDeleting(false);
    }
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
          className="surface w-full grid grid-cols-1 md:grid-cols-2 gap-0 relative overflow-y-auto md:overflow-hidden"
          style={{ maxWidth: 980, maxHeight: "90vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Floating close — always visible regardless of scroll position */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-2"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-dim)", cursor: "pointer" }}
            aria-label="Close"
          >
            <X size={16} />
          </button>

          {/* LEFT: preview — capped at 45vh on mobile so details are visible below */}
          <div className="relative" style={{ background: "var(--bg)" }}>
            {outfit.preview_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={outfit.preview_image_url}
                alt={outfit.name}
                className="w-full object-contain"
                style={{ maxHeight: "45vh", display: "block" }}
              />
            ) : (
              <div className="flex items-center justify-center" style={{ minHeight: 200, background: "var(--surface2)" }}>
                <Layers size={48} style={{ color: "var(--text-dim)" }} />
              </div>
            )}
          </div>

          {/* RIGHT: details + items + actions */}
          <div className="p-5 md:p-7 flex flex-col md:overflow-y-auto" style={{ maxHeight: "90vh" }}>
            <div className="flex items-start justify-between mb-2 pr-8">
              <div>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--gold)" }}>
                  Saved outfit
                </div>
                <h2 className="font-display text-3xl">{outfit.name}</h2>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-3 mb-5">
              {outfit.occasion && (
                <span className="chip">
                  <Tag size={11} style={{ marginRight: 4 }} /> {outfit.occasion}
                </span>
              )}
              <span className="chip">
                <Calendar size={11} style={{ marginRight: 4 }} />
                {new Date(outfit.created_at).toLocaleDateString(undefined, {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </span>
              <span className="chip">{outfit.item_ids.length} items</span>
            </div>

            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Items in this outfit
            </div>
            {loadingItems ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                <Loader2 size={14} className="spin" /> Loading items...
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                The original items are no longer in your wardrobe.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 mb-5">
                {items.map((it) => (
                  <div key={it.id} className="surface flex items-center gap-2 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.image_url} alt={it.name}
                      style={{ width: 44, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{it.name}</div>
                      <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                        {it.category}{it.color ? ` - ${it.color}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {outfit.notes && (
              <>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Notes</div>
                <p className="text-sm mb-5" style={{ color: "var(--text)" }}>{outfit.notes}</p>
              </>
            )}

            <div className="mt-auto pt-5 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
              <button className="btn-primary w-full" onClick={tryThisOutfit}>
                <Sparkles size={14} /> Try this outfit again
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={() => setShowShare(true)}>
                  <Share2 size={14} /> Share
                </button>
                <button
                  className="btn-secondary"
                  style={{ color: "var(--red)", borderColor: "var(--red)" }}
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {showShare && (
        <ShareToFriendModal
          target={{
            outfit_id: outfit.id,
            preview_image_url: outfit.preview_image_url || undefined,
            label: outfit.name,
          }}
          onClose={() => setShowShare(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this outfit?"
        description={`"${outfit.name}" will be removed. The wardrobe items themselves stay.`}
        confirmLabel={deleting ? "Deleting..." : "Delete outfit"}
        destructive
        onConfirm={performDelete}
      />
    </>
  );
}
