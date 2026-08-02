"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Shuffle } from "lucide-react";
import { useWardrobeItems } from "@/lib/useWardrobeItems";
import { apiGet, apiPost } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import type { WardrobeItem } from "@/types";

interface StyleCard {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  cutout_url?: string;
  category?: string;
}

export default function ThisOrThat() {
  const { items } = useWardrobeItems();
  const [mode, setMode] = useState<"items" | "styles">("styles");
  const [choices, setChoices] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pairIdx, setPairIdx] = useState(0);

  const pairs = useMemo(() => {
    const arr = [...items].sort(() => Math.random() - 0.5);
    const out: { a: WardrobeItem; b: WardrobeItem }[] = [];
    for (let i = 0; i + 1 < arr.length; i += 2) out.push({ a: arr[i], b: arr[i + 1] });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const [stylePair, setStylePair] = useState<{ pair_id: string; item_a: StyleCard; item_b: StyleCard } | null>(null);
  const [loadingStyle, setLoadingStyle] = useState(false);

  async function fetchStylePair() {
    setLoadingStyle(true);
    try {
      const d = await apiGet<{ pair_id: string; item_a: StyleCard; item_b: StyleCard }>(
        "/api/stylist/this-or-that?type=styles"
      );
      setStylePair(d);
    } catch {
      toast.error("Could not load style pair.");
    } finally {
      setLoadingStyle(false);
    }
  }

  useEffect(() => {
    if (mode === "styles" && !stylePair) fetchStylePair();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function pickItem(chosen: WardrobeItem, other: WardrobeItem) {
    setChoices((c) => c + 1);
    setPairIdx((i) => i + 1);
    setSaving(true);
    try {
      await apiPost("/api/stylist/this-or-that", {
        pair_id: `local-${Date.now()}`,
        question_type: "items",
        item_a_id: chosen.id,
        item_b_id: other.id,
        chosen_id: chosen.id,
      });
    } catch {
      /* non-fatal */
    } finally {
      setSaving(false);
    }
  }

  async function pickStyle(chosen: StyleCard, other: StyleCard) {
    setChoices((c) => c + 1);
    setSaving(true);
    try {
      await apiPost("/api/stylist/this-or-that", {
        pair_id: stylePair?.pair_id || `style-${Date.now()}`,
        question_type: "styles",
        item_a_id: chosen.id,
        item_b_id: other.id,
        chosen_id: chosen.id,
        chosen_name: chosen.name,
        rejected_name: other.name,
      });
    } catch {
      /* non-fatal */
    } finally {
      setSaving(false);
    }
    fetchStylePair();
  }

  const feedbackLine =
    choices === 0
      ? "Each pick teaches Aria your taste — used in every chat."
      : choices < 3
        ? `${choices} saved · ${3 - choices} more to warm up Aria.`
        : `Aria has ${choices} taste signals from you.`;

  if (items.length < 2 && mode === "items") {
    return (
      <div className="flex flex-col items-center py-6 text-center text-muted">
        <Shuffle size={24} className="mb-2 opacity-50" />
        <p className="text-sm mb-3">Add two wardrobe items to compare pieces, or use style archetypes.</p>
        <button type="button" className="chip" onClick={() => setMode("styles")}>
          Style archetypes
        </button>
      </div>
    );
  }

  return (
    <div className="flex max-h-[min(70vh,520px)] flex-col min-h-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" className={`chip ${mode === "styles" ? "chip-active" : ""}`} onClick={() => setMode("styles")}>
            Style archetypes
          </button>
          <button type="button" className={`chip ${mode === "items" ? "chip-active" : ""}`} onClick={() => setMode("items")}>
            My items
          </button>
        </div>
        {saving && <Loader2 size={12} className="spin text-muted" />}
      </div>

      <p className="text-xs text-center text-muted mb-3">{feedbackLine}</p>

      <div className="flex-1 overflow-y-auto flex flex-col items-center gap-3">
        {mode === "items" && pairs.length > 0 && (() => {
          const pair = pairs[pairIdx % pairs.length];
          return (
            <ItemPair
              a={pair.a}
              b={pair.b}
              onPick={(chosen) => pickItem(chosen, chosen.id === pair.a.id ? pair.b : pair.a)}
            />
          );
        })()}

        {mode === "styles" &&
          (loadingStyle || !stylePair ? (
            <div className="flex items-center gap-2 text-sm text-muted py-8">
              <Loader2 size={14} className="spin" /> Loading styles…
            </div>
          ) : (
            <StyleArchetypePair
              a={stylePair.item_a}
              b={stylePair.item_b}
              onPick={(chosen) => {
                const other = chosen.id === stylePair.item_a.id ? stylePair.item_b : stylePair.item_a;
                pickStyle(chosen, other);
              }}
            />
          ))}
      </div>
    </div>
  );
}

function ItemPair({ a, b, onPick }: { a: WardrobeItem; b: WardrobeItem; onPick: (item: WardrobeItem) => void }) {
  return (
    <div className="relative grid grid-cols-2 gap-3 w-full max-w-sm">
      {[a, b].map((item) => (
        <motion.button
          key={item.id}
          type="button"
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onPick(item)}
          className="surface text-left border border-border overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.cutout_url || item.image_url}
            alt={item.name}
            className="w-full object-cover aspect-[3/4] block"
          />
          <div className="p-2">
            <div className="text-xs font-mono truncate">{item.name}</div>
            <div className="text-2xs capitalize mt-0.5 text-muted">{item.category}</div>
          </div>
        </motion.button>
      ))}
      <OrDivider />
    </div>
  );
}

function StyleArchetypePair({ a, b, onPick }: { a: StyleCard; b: StyleCard; onPick: (card: StyleCard) => void }) {
  return (
    <div className="relative grid grid-cols-2 gap-3 w-full max-w-sm">
      {[a, b].map((card) => (
        <motion.button
          key={card.id}
          type="button"
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onPick(card)}
          className="surface text-left flex flex-col border border-border min-h-[140px]"
        >
          <div className="w-full flex items-center justify-center flex-1 p-4 bg-surface-2 aspect-square">
            <span className="font-display text-center leading-tight text-base">{card.name}</span>
          </div>
          {card.description && (
            <div className="p-2">
              <div className="text-2xs leading-relaxed text-muted">{card.description}</div>
            </div>
          )}
        </motion.button>
      ))}
      <OrDivider />
    </div>
  );
}

function OrDivider() {
  return (
    <div className="absolute pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2] border border-border bg-bg px-2 py-0.5">
      <span className="text-xs font-mono text-muted">or</span>
    </div>
  );
}
