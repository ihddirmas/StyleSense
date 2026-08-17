"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MinusCircle, AlertCircle } from "lucide-react";
import { apiPost } from "@/lib/api";

interface Verdict {
  verdict: "flatters" | "neutral" | "reconsider";
  reason: string;
}

interface ItemVerdict {
  id: string | null;
  name: string | null;
  color: Verdict;
  silhouette?: Verdict;
}

interface VerdictResponse {
  ready: boolean;
  items: ItemVerdict[];
  score: number;
}

const VERDICT_STYLE: Record<Verdict["verdict"], { color: string; Icon: typeof CheckCircle2 }> = {
  flatters: { color: "var(--green)", Icon: CheckCircle2 },
  neutral: { color: "var(--text-muted)", Icon: MinusCircle },
  reconsider: { color: "var(--red)", Icon: AlertCircle },
};

function VerdictRow({ label, verdict }: { label: string; verdict: Verdict }) {
  const { color, Icon } = VERDICT_STYLE[verdict.verdict] ?? VERDICT_STYLE.neutral;
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon size={14} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <span>
        <span className="font-semibold" style={{ color }}>{label}:</span>{" "}
        <span style={{ color: "var(--text-muted)" }}>{verdict.reason}</span>
      </span>
    </div>
  );
}

/**
 * Aria's suitability read on the items in the current try-on — rendered under
 * every Studio result. Backed by POST /api/stylist/verdict, which is
 * deterministic scoring against the cached color/Kibbe profiles: free, so it
 * can fire on every generation.
 */
export function TryOnVerdict({ itemIds, resultId }: { itemIds: string[]; resultId: string }) {
  const [data, setData] = useState<VerdictResponse | null>(null);

  useEffect(() => {
    if (itemIds.length === 0) return;
    let cancelled = false;
    setData(null);
    apiPost<VerdictResponse>("/api/stylist/verdict", { item_ids: itemIds })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resultId, itemIds]);

  if (itemIds.length === 0 || data === null) return null;

  if (!data.ready) {
    return (
      <div className="surface p-3 mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
        Complete your{" "}
        <Link href="/stylist/analysis" style={{ color: "var(--on-gold)", textDecoration: "underline" }}>
          color and body-type analysis
        </Link>{" "}
        to get Aria&apos;s verdict on every look.
      </div>
    );
  }

  return (
    <div className="surface p-3 mt-3">
      <div className="text-2xs uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
        Aria&apos;s read — grounded in your color season and Kibbe line
      </div>
      <div className="space-y-2">
        {data.items.map((it) => (
          <div key={it.id ?? it.name} className="space-y-1">
            {data.items.length > 1 && (
              <div className="text-xs font-medium" style={{ color: "var(--text)" }}>{it.name}</div>
            )}
            <VerdictRow label="Color" verdict={it.color} />
            {it.silhouette && <VerdictRow label="Silhouette" verdict={it.silhouette} />}
          </div>
        ))}
      </div>
    </div>
  );
}
