"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Plus, Trash2, Sparkles, Shirt, Loader2, Link as LinkIcon, Upload, Check, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAppStore } from "@/store/app";
import { useAuth } from "@/components/AuthProvider";
import { apiGet, apiPost, apiDelete, apiUpload } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { AddItemModal } from "@/components/wardrobe/AddItemModal";
import type { WardrobeItem, DetectedItem } from "@/types";

const CATEGORIES = ["all", "tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];
const OCCASIONS = ["any", "casual", "formal", "evening", "sport", "beach"];

export default function WardrobePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [filterCategory, setFilterCategory] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toggleSelected, selectedItemIds, clearSelected } = useAppStore();
  const [pendingDelete, setPendingDelete] = useState<WardrobeItem | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiGet<WardrobeItem[]>(`/api/wardrobe`);
      setItems(data);
    } catch (e) {
      toast.error(`Failed to load wardrobe: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (user) refresh(); }, [user]);

  async function performDelete(id: string) {
    try {
      await apiDelete(`/api/wardrobe/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Item removed.");
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  const filtered = filterCategory === "all"
    ? items
    : items.filter((i) => i.category === filterCategory);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0">
        <PageHeader
          tutorialKey="wardrobe"
          subtitle="Add items by photo upload or product URL. Select up to 2 items, then open Studio to try them on."
          action={
            <div className="flex items-center gap-2">
              {selectedItemIds.length > 0 && (
                <Link href="/studio" className="btn-primary">
                  <Sparkles size={16} /> Try on {selectedItemIds.length} selected
                </Link>
              )}
              <button className="btn-primary" onClick={() => setShowAdd(true)}>
                <Plus size={16} /> Add item
              </button>
            </div>
          }
        />

        {filterCategory !== "all" && (
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex items-center gap-1 text-xs" style={{ listStyle: "none", padding: 0, margin: 0, color: "var(--text-muted)" }}>
              <li>
                <button
                  onClick={() => setFilterCategory("all")}
                  className="hover:underline"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, fontSize: "inherit" }}
                >
                  Wardrobe
                </button>
              </li>
              <li aria-hidden="true" style={{ userSelect: "none" }}>/</li>
              <li aria-current="page" style={{ color: "var(--ink)", fontWeight: 600, textTransform: "capitalize" }}>
                {filterCategory}
              </li>
            </ol>
          </nav>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`chip ${filterCategory === c ? "chip-active" : ""}`}
              onClick={() => setFilterCategory(c)}
              aria-pressed={filterCategory === c}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
      {loading ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="surface aspect-[3/4] shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface p-12 text-center" style={{ color: "var(--text-muted)" }}>
          <Shirt size={32} className="mx-auto mb-3" style={{ color: "var(--text-dim)" }} />
          <p>{items.length === 0 ? "Your wardrobe is empty." : `No items in ${filterCategory}.`}</p>
          {items.length === 0 && (
            <button className="btn-primary mt-4" onClick={() => setShowAdd(true)}>
              <Plus size={16} /> Add your first item
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <AnimatePresence>
            {filtered.map((item, i) => {
              const selected = selectedItemIds.includes(item.id);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.03 }}
                  className="surface surface-hover overflow-hidden cursor-pointer relative group"
                  style={{ borderColor: selected ? "var(--gold)" : undefined }}
                  onClick={() => toggleSelected(item.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full aspect-[3/4] object-cover"
                  />
                  {selected && (
                    <div
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs"
                      style={{ background: "var(--gold)", color: "var(--on-gold)" }}
                    >
                      {selectedItemIds.indexOf(item.id) + 1}
                    </div>
                  )}
                  <div className="px-3 py-2">
                    <div className="text-sm truncate" title={item.name}>{item.name}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                        {item.category}{item.color ? ` · ${item.color}` : ""}
                      </span>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition"
                        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); setPendingDelete(item); }}
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
      </div>

      {selectedItemIds.length > 0 && (
        <div
          className="fixed bottom-6 left-1/2 surface px-5 py-3 flex items-center gap-3"
          style={{ transform: "translateX(-50%)", zIndex: 50, boxShadow: "0 12px 40px -12px rgba(0,0,0,0.7)" }}
        >
          <span className="text-sm">
            <strong style={{ color: "var(--text)" }}>{selectedItemIds.length}</strong> selected
            {selectedItemIds.length >= 6 && <span style={{ color: "var(--text-muted)" }}> (max)</span>}
          </span>
          <button className="btn-secondary" onClick={clearSelected} style={{ padding: "0.4rem 0.9rem" }}>
            Clear
          </button>
          <Link href="/studio" className="btn-primary" style={{ padding: "0.5rem 1rem" }}>
            <Sparkles size={14} /> Try on
          </Link>
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <AddItemModal
            isOpen={showAdd}
            onClose={() => setShowAdd(false)}
            onAdded={(item) => { setItems((p) => [item, ...p]); setShowAdd(false); }}
            onAddedMany={(rows) => { setItems((p) => [...rows, ...p]); setShowAdd(false); }}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Remove this item?"
        description={pendingDelete?.name}
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (pendingDelete) performDelete(pendingDelete.id); }}
      />
    </div>
  );
}