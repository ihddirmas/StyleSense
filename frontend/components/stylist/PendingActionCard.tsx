"use client";
import { useState } from "react";
import { Check, Loader2, Sparkles, Wand2, X } from "lucide-react";
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

const TOOL_LABELS: Record<string, string> = {
  add_wardrobe_items: "Add to wardrobe",
  generate_tryon: "Generate try-on",
};

export function PendingActionCard({ action, onResolve }: Props) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);

  if (action.status !== "pending") return null;

  const toolLabel = TOOL_LABELS[action.toolName] ?? "Agent action";

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
    <div className="agent-action-card mt-3">
      <div className="flex items-start gap-2.5">
        <div className="agent-action-card-icon shrink-0" aria-hidden>
          {action.toolName === "generate_tryon" ? <Wand2 size={14} /> : <Sparkles size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="section-label normal-case tracking-widest text-2xs mb-1">
            Aria wants to · {toolLabel}
          </div>
          <p className="text-sm leading-snug text-ink m-0">{action.summary}</p>
          {typeof action.costCredits === "number" && (
            <p className="text-2xs font-mono uppercase tracking-widest text-muted mt-1.5 mb-0">
              ~{action.costCredits} credits · you confirm before anything runs
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={() => respond("confirm")}
          disabled={busy !== null}
        >
          {busy === "confirm" ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
          Confirm
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
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
