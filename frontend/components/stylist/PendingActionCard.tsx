"use client";
import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { apiPost } from "@/lib/api";
import type { PendingAction } from "@/types";

interface ToolConfirmResponse {
  executed: boolean;
  summary: string;
  result_image_url?: string | null;
  result_id?: string | null;
}

export interface PendingActionResult {
  status: "confirmed" | "cancelled";
  summary: string;
  resultImageUrl?: string;
  resultId?: string;
}

interface Props {
  action: PendingAction;
  onResolve: (result: PendingActionResult) => void;
}

export function PendingActionCard({ action, onResolve }: Props) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);

  if (action.status !== "pending") return null;

  async function respond(decision: "confirm" | "cancel") {
    setBusy(decision);
    try {
      const res = await apiPost<ToolConfirmResponse>("/api/stylist/tool-confirm", {
        tool_name: action.toolName,
        tool_use_id: action.toolUseId,
        decision,
      });
      onResolve({
        status: decision === "confirm" ? "confirmed" : "cancelled",
        summary: res.summary,
        resultImageUrl: res.result_image_url ?? undefined,
        resultId: res.result_id ?? undefined,
      });
    } catch (e) {
      onResolve({
        status: "cancelled",
        summary: `Couldn't complete that: ${e instanceof Error ? e.message : "unknown error"}`,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="mt-2 px-3 py-2.5"
      style={{ background: "var(--gold-dim)", border: "1px solid var(--border-gold)" }}
    >
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink)" }}>
        <Sparkles size={13} style={{ color: "var(--gold)", flexShrink: 0 }} />
        <span>{action.summary}</span>
      </div>
      {typeof action.costCredits === "number" && (
        <div className="text-2xs uppercase tracking-widest mt-1" style={{ color: "var(--text-muted)" }}>
          ~{action.costCredits} credits
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <button
          className="btn-primary"
          style={{ padding: "0.4rem 0.8rem", fontSize: "0.75rem" }}
          onClick={() => respond("confirm")}
          disabled={busy !== null}
        >
          {busy === "confirm" ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
          Confirm
        </button>
        <button
          className="btn-secondary"
          style={{ padding: "0.4rem 0.8rem", fontSize: "0.75rem" }}
          onClick={() => respond("cancel")}
          disabled={busy !== null}
        >
          <X size={12} />
          Cancel
        </button>
      </div>
    </div>
  );
}
