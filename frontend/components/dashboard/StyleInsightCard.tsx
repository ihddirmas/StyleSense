"use client";
import { Sparkles } from "lucide-react";
import type { WardrobeItem, TryOnResult } from "@/types";

function deriveSignals(items: WardrobeItem[], recent: TryOnResult[]) {
  if (!items.length) return [];

  const triedIds = new Set(recent.map(r => r.wardrobe_item_id).filter(Boolean));
  const idCounts = recent.reduce<Record<string, number>>((acc, r) => {
    if (r.wardrobe_item_id) acc[r.wardrobe_item_id] = (acc[r.wardrobe_item_id] || 0) + 1;
    return acc;
  }, {});
  const mostTriedId = Object.entries(idCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const mostTried = items.find(i => i.id === mostTriedId);
  const untried = items.filter(i => !triedIds.has(i.id));

  const allCategories = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"] as const;
  const ownedCats = new Set(items.map(i => i.category));
  const missing = allCategories.filter(c => !ownedCats.has(c));

  const signals: { label: string; value: string }[] = [];
  if (mostTried) signals.push({ label: "Reach for this most", value: mostTried.name });
  if (untried.length > 0) signals.push({ label: "Sitting unworn", value: `${untried.length} ${untried.length === 1 ? "piece" : "pieces"}` });
  if (missing.length > 0 && missing.length <= 2) signals.push({ label: "Gap in your closet", value: missing.join(" · ") });

  return signals;
}

export function StyleInsightCard({
  insight,
  items,
  recent,
}: {
  insight: string | null;
  items: WardrobeItem[];
  recent: TryOnResult[];
}) {
  const signals = deriveSignals(items, recent);

  if (!insight && !signals.length) return null;

  return (
    <div className="surface" style={{ borderColor: "var(--border-gold)", padding: "20px 22px" }}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={13} style={{ color: "var(--gold)" }} />
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--gold)" }}>
          Style Read
        </span>
      </div>

      {insight && (
        <p className="font-display text-lg leading-snug" style={{ color: "var(--text)" }}>
          {insight}
        </p>
      )}

      {signals.length > 0 && (
        <div
          className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4"
          style={{ borderTop: insight ? "1px solid var(--border)" : "none", marginTop: insight ? undefined : 0, paddingTop: insight ? undefined : 0 }}
        >
          {signals.map(s => (
            <div key={s.label}>
              <div className="text-[9px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "var(--text-dim)" }}>
                {s.label}
              </div>
              <div className="text-sm font-mono" style={{ color: "var(--text)" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
