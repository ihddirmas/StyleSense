"use client";
import { useRef } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { WardrobeItem } from "@/types";

export function ClosetShelf({
  label,
  items,
  selectedItemIds,
  onSelect,
  onDelete,
}: {
  label: string;
  items: WardrobeItem[];
  selectedItemIds: string[];
  onSelect: (id: string) => void;
  onDelete: (item: WardrobeItem) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  function scrollBy(dir: 1 | -1) {
    scroller.current?.scrollBy({ left: dir * 360, behavior: "smooth" });
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display capitalize text-lg" style={{ color: "var(--text)" }}>
            {label}
          </h3>
          <span className="text-xs tracking-widest" style={{ color: "var(--text-dim)", textTransform: "uppercase" }}>
            {items.length}
          </span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => scrollBy(-1)} className="closet-chevron" aria-label="Scroll left">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => scrollBy(1)} className="closet-chevron" aria-label="Scroll right">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scroller}
          className="flex gap-3 overflow-x-auto pb-4 closet-scroller"
          style={{ scrollSnapType: "x proximity" }}
        >
          {items.map((item) => {
            const selected = selectedItemIds.includes(item.id);
            const order = selectedItemIds.indexOf(item.id) + 1;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                title={item.name}
                className="closet-item group relative shrink-0"
                style={{
                  scrollSnapAlign: "start",
                  width: 110,
                  border: selected ? "1px solid var(--ink)" : "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.cutout_url || item.image_url}
                  alt={item.name}
                  className="closet-cutout"
                  style={{
                    width: "100%",
                    aspectRatio: "3/4",
                    objectFit: "contain",
                    display: "block",
                    background: item.cutout_url ? "transparent" : "var(--surface2)",
                  }}
                />
                {/* name badge */}
                <div
                  className="px-2 py-1 text-xs font-mono truncate"
                  style={{
                    background: selected ? "var(--ink)" : "var(--surface2)",
                    color: selected ? "var(--bg)" : "var(--text-dim)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  {item.name}
                </div>
                {selected && (
                  <div
                    className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center font-bold"
                    className="text-xs"
                    style={{ background: "var(--gold)", color: "var(--on-gold)" }}
                  >
                    {order}
                  </div>
                )}
                <button
                  className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition w-6 h-6 flex items-center justify-center"
                  style={{ background: "var(--surface2)", color: "var(--text-dim)", border: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                  aria-label="Delete"
                >
                  <Trash2 size={11} />
                </button>
              </button>
            );
          })}
        </div>
        <div className="closet-plank" />
      </div>
    </div>
  );
}
