"use client";

import { Briefcase, Package } from "lucide-react";

export interface CapsulePlan {
  destination: string;
  days: number;
  dress_code: string;
  daily_outfits?: Array<{
    day?: number;
    label?: string;
    items?: Array<{ id: string; name: string; category?: string }>;
    notes?: string;
  }>;
  gaps?: Array<{ category?: string; description?: string; suggestion?: string; why?: string }>;
  packing_notes?: string[];
  coverage_pct?: number;
}

export function CapsulePlanCard({ plan }: { plan: CapsulePlan }) {
  if (!plan?.daily_outfits?.length && !plan?.gaps?.length) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-foreground mb-2">
        <Briefcase size={14} className="text-accent shrink-0" />
        Capsule: {plan.destination} · {plan.days} days · {plan.dress_code}
        {typeof plan.coverage_pct === "number" && (
          <span className="text-2xs text-muted font-normal ml-auto">{plan.coverage_pct}% from your closet</span>
        )}
      </div>

      {plan.daily_outfits && plan.daily_outfits.length > 0 && (
        <ul className="space-y-2 mb-2 list-none p-0 m-0">
          {plan.daily_outfits.map((day) => (
            <li key={day.day ?? day.label} className="border-t border-border/60 pt-2 first:border-0 first:pt-0">
              <p className="font-medium text-xs m-0">{day.label || `Day ${day.day}`}</p>
              {day.items && day.items.length > 0 && (
                <p className="text-2xs text-muted m-0 mt-0.5">
                  {day.items.map((it) => it.name).join(" · ")}
                </p>
              )}
              {day.notes && <p className="text-2xs m-0 mt-0.5">{day.notes}</p>}
            </li>
          ))}
        </ul>
      )}

      {plan.gaps && plan.gaps.length > 0 && (
        <div className="text-2xs text-muted">
          <p className="font-medium text-foreground flex items-center gap-1 m-0 mb-1">
            <Package size={12} /> Gaps to fill
          </p>
          <ul className="m-0 pl-4">
            {plan.gaps.slice(0, 5).map((g, idx) => (
              <li key={idx}>{g.suggestion || g.description || g.category}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.packing_notes && plan.packing_notes.length > 0 && (
        <p className="text-2xs text-muted m-0 mt-2">{plan.packing_notes[0]}</p>
      )}
    </div>
  );
}
