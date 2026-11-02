"use client";

import { formatReason } from "@/components/stylist/LookCheckCard";
import type { PurchaseVerdict } from "@/types";

const VERDICT_COPY: Record<PurchaseVerdict["verdict"], { title: string; className: string }> = {
  buy: { title: "Worth buying", className: "text-status-pass" },
  think: { title: "Think twice", className: "text-status-warn" },
  skip: { title: "Skip it", className: "text-status-fail" },
  unknown: { title: "Can't judge yet", className: "text-muted" },
};

export function PurchaseVerdictCard({ verdict }: { verdict: PurchaseVerdict }) {
  const copy = VERDICT_COPY[verdict.verdict];
  const pairNames = verdict.pairs_with.map((item) => item.name).join(", ");
  const colorReason = verdict.color.reasons[0];

  return (
    <section
      aria-label={`Buy or skip: ${copy.title}`}
      className="mt-3 rounded-lg border border-border bg-surface-2 p-3 sm:p-4"
    >
      <p className="text-2xs uppercase tracking-wider text-muted m-0">Buy or skip</p>
      <p className={`font-display text-3xl leading-tight m-0 mt-0.5 ${copy.className}`}>{copy.title}</p>
      <p className="text-xs text-muted m-0 mt-1">{verdict.product.name}</p>
      <p className="text-sm text-foreground m-0 mt-2 leading-relaxed">{verdict.reason}</p>

      <dl className="m-0 mt-3 text-xs">
        <div className="border-t border-border/60 py-2">
          <dt className="font-medium text-foreground">Outfits with what you own</dt>
          <dd className="m-0 mt-0.5 text-muted">
            {verdict.outfits_with_closet}
            {pairNames ? `: ${pairNames}` : ""}
          </dd>
        </div>
        {colorReason && (
          <div className="border-t border-border/60 py-2">
            <dt className="font-medium text-foreground">Color on you</dt>
            <dd className="m-0 mt-0.5 text-muted leading-relaxed">{formatReason(colorReason)}</dd>
          </div>
        )}
      </dl>

      <p className="text-2xs text-muted m-0 pt-2 border-t border-border/60">
        {verdict.measured_skin ? "Skin tone measured by YouCam Skin AI" : "No measured skin tone yet"}
        {" · Product color taken from its listing, not measured"}
      </p>
    </section>
  );
}
