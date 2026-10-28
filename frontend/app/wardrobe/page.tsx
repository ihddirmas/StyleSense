"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Sparkles, Shirt, Check, X, ArrowUpDown } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAppStore } from "@/store/app";
import { useAuth } from "@/components/AuthProvider";
import { apiGet, apiDelete } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { AddItemModal } from "@/components/wardrobe/AddItemModal";
import { OutfitSuggestions } from "@/components/wardrobe/OutfitSuggestions";
import type { WardrobeItem } from "@/types";
import posthog from "posthog-js";

const CATEGORIES = ["all", "tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];
const OCCASIONS = ["any", "casual", "formal", "evening", "sport", "beach"];

type SortMode = "recent" | "name";

export default function WardrobePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterOccasion, setFilterOccasion] = useState("any");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
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
      const item = items.find((i) => i.id === id);
      await apiDelete(`/api/wardrobe/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      posthog.capture("wardrobe_item_deleted", { category: item?.category });
      toast.success("Item removed.");
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  const filtered = useMemo(() => {
    let list = items;
    if (filterCategory !== "all") {
      list = list.filter((i) => i.category === filterCategory);
    }
    if (filterOccasion !== "any") {
      list = list.filter((i) => !i.occasion || i.occasion === "any" || i.occasion === filterOccasion);
    }
    const sorted = [...list];
    if (sortMode === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return sorted;
  }, [items, filterCategory, filterOccasion, sortMode]);

  function handleCreate() {
    if (selectedItemIds.length === 0) {
      toast.error("Select items from your closet, then Create.");
      return;
    }
    posthog.capture("wardrobe_create_outfit", { item_count: selectedItemIds.length });
    router.push("/studio");
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="shrink-0">
        <PageHeader
          eyebrow="Wardrobe"
          title="Items"
          tutorialKey="wardrobe"
          subtitle="Import from your camera roll, filter by category, then Create an outfit to try on."
          action={
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={() => setShowAdd(true)}>
                <Plus size={16} /> Add
              </button>
              <button className="btn-primary" onClick={handleCreate} disabled={selectedItemIds.length === 0}>
                <Shirt size={16} /> Create
              </button>
            </div>
          }
        />

        <div className="flex items-center gap-4 mb-4 border-b" style={{ borderColor: "var(--border)" }}>
          <span
            className="pb-2 text-sm font-semibold"
            style={{ color: "var(--ink)", borderBottom: "2px solid var(--ink)" }}
          >
            Items
          </span>
          <Link
            href="/outfits"
            className="pb-2 text-sm"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}
          >
            Outfits
          </Link>
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map((c) => {
            const active = filterCategory === c;
            return (
              <button
                key={c}
                className={`chip shrink-0 ${active ? "chip-active" : ""}`}
                onClick={() => setFilterCategory(c)}
                aria-pressed={active}
              >
                {c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
                {active && c !== "all" && (
                  <X
                    size={12}
                    className="ml-1 inline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterCategory("all");
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {OCCASIONS.map((o) => (
              <button
                key={o}
                className={`chip shrink-0 text-xs ${filterOccasion === o ? "chip-active" : ""}`}
                onClick={() => setFilterOccasion(o)}
                aria-pressed={filterOccasion === o}
              >
                {o === "any" ? "Any occasion" : o.charAt(0).toUpperCase() + o.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="shrink-0 flex items-center gap-1.5 text-xs"
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            onClick={() => setSortMode((m) => (m === "recent" ? "name" : "recent"))}
            aria-label="Change sort"
          >
            <ArrowUpDown size={13} />
            {sortMode === "recent" ? "Most recent" : "Name"}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-24">
        {!loading && <OutfitSuggestions hasItems={items.length > 0} />}
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="wardrobe-cutout-tile shimmer" style={{ aspectRatio: "1" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface p-12 text-center" style={{ color: "var(--text-muted)" }}>
            <Shirt size={32} className="mx-auto mb-3" style={{ color: "var(--text-dim)" }} />
            <p>{items.length === 0 ? "Your wardrobe is empty." : "No items match these filters."}</p>
            {items.length === 0 && (
              <button className="btn-primary mt-4" onClick={() => setShowAdd(true)}>
                <Plus size={16} /> Import from gallery
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            <AnimatePresence>
              {filtered.map((item, i) => {
                const selected = selectedItemIds.includes(item.id);
                const src = item.cutout_url || item.image_url;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: Math.min(i, 12) * 0.02 }}
                    className="wardrobe-cutout-tile group relative"
                    style={{
                      outline: selected ? "2px solid var(--ink)" : undefined,
                      outlineOffset: 1,
                    }}
                    onClick={() => toggleSelected(item.id)}
                    aria-pressed={selected}
                    aria-label={`${selected ? "Deselect" : "Select"} ${item.name}`}
                  >
                    <span
                      className="absolute top-2 left-2 z-10 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{
                        background: selected ? "var(--ink)" : "rgba(255,255,255,0.85)",
                        border: `1.5px solid ${selected ? "var(--ink)" : "var(--border)"}`,
                        color: selected ? "var(--parchment)" : "transparent",
                      }}
                    >
                      {selected && <Check size={11} strokeWidth={3} />}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={item.name}
                      className="wardrobe-cutout-img"
                    />
                    <button
                      type="button"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition w-7 h-7 flex items-center justify-center rounded-full"
                      style={{ background: "rgba(255,255,255,0.9)", border: "1px solid var(--border)", color: "var(--text-dim)", cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); setPendingDelete(item); }}
                      aria-label="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                    <span className="sr-only">{item.name}</span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {selectedItemIds.length > 0 && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 surface px-4 py-2.5 flex items-center gap-3"
          style={{ boxShadow: "0 12px 40px -12px rgba(0,0,0,0.35)" }}
        >
          <span className="text-sm">
            <strong style={{ color: "var(--text)" }}>{selectedItemIds.length}</strong> selected
            {selectedItemIds.length >= 6 && <span style={{ color: "var(--text-muted)" }}> (max)</span>}
          </span>
          <button className="btn-secondary px-3 py-1.5" onClick={clearSelected}>
            Clear
          </button>
          <Link href="/studio" className="btn-secondary px-3 py-1.5 inline-flex items-center gap-1.5">
            <Sparkles size={14} /> Try on
          </Link>
        </div>
      )}

      <button
        type="button"
        className="wardrobe-create-fab"
        onClick={handleCreate}
        aria-label="Create outfit"
      >
        <Shirt size={18} />
        Create
      </button>

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
