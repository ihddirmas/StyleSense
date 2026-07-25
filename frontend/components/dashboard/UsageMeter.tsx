"use client";
import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { apiGet } from "@/lib/api";

export function UsageMeter() {
  const [status, setStatus] = useState<{ used: number; limit: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiGet<{ used: number; limit: number }>("/api/tryon/usage-status")
      .then(setStatus)
      .catch(() => setFailed(true));
  }, []);

  if (failed || !status) return null;

  const pct = Math.min(100, Math.round((status.used / status.limit) * 100));

  return (
    <div className="surface p-4 md:p-5" style={{ borderColor: "var(--border-hover)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={13} style={{ color: "var(--gold)" }} />
        <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--gold)" }}>
          Monthly Try-Ons
        </span>
      </div>
      <div className="text-xs sm:text-sm font-mono mb-2" style={{ color: "var(--text)" }}>
        {status.used} of {status.limit} used this month
      </div>
      <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "var(--gold)",
            borderRadius: 2,
            transition: "width 300ms ease",
          }}
        />
      </div>
    </div>
  );
}
