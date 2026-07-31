"use client";
import { useEffect, useState } from "react";
import { Gauge, Zap } from "lucide-react";
import { apiGet } from "@/lib/api";

export function UsageMeter() {
  const [status, setStatus] = useState<{ used: number; limit: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ tryon: { used: number; limit: number } }>("/api/tryon/usage-status")
      .then((d) => { setStatus(d.tryon); setLoading(false); })
      .catch(() => { setFailed(true); setLoading(false); });
  }, []);

  if (failed) return null;

  const pct = status ? Math.min(100, Math.round((status.used / status.limit) * 100)) : 0;

  return (
    <div className="surface p-4 md:p-5" style={{ borderColor: "var(--border-hover)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={13} style={{ color: "var(--on-gold)" }} />
        <span className="text-2xs font-mono uppercase tracking-widest" style={{ color: "var(--on-gold)" }}>
          Monthly Try-Ons
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-3 w-32 rounded shimmer" />
          <div className="h-2 w-full rounded-full" style={{ background: "var(--surface2)" }} />
        </div>
      ) : status && status.limit <= 0 ? null : (
        <>
          <div className="text-xs sm:text-sm font-mono mb-2" style={{ color: "var(--text)" }}>
            {status!.used} of {status!.limit} used this month
          </div>
          <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: "var(--on-gold)",
                borderRadius: 2,
                transition: "width 300ms ease",
              }}
            />
          </div>
          {status!.used >= status!.limit && (
            <div className="flex items-center gap-1.5 mt-2.5 text-2xs sm:text-xs" style={{ color: "var(--on-gold)" }}>
              <Zap size={11} />
              <span>Upgrade to Studio for unlimited try-ons</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
