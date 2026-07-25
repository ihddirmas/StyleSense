"use client";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { WardrobeItem } from "@/types";

export function ContinueCard({ item }: { item: WardrobeItem }) {
  return (
    <Link
      href={`/studio?item=${item.id}`}
      className="surface surface-hover block p-3"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image_url}
          alt={item.name}
          style={{ width: 44, height: 44, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-hover)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Sparkles size={11} style={{ color: "var(--gold)" }} />
            <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "var(--gold)" }}>
              Continue
            </span>
          </div>
          <div className="text-xs sm:text-sm font-display leading-tight truncate" style={{ color: "var(--text)" }}>
            See {item.name} on you
          </div>
        </div>
      </div>
    </Link>
  );
}
