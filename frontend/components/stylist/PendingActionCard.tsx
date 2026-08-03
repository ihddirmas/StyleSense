"use client";
import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { apiPost } from "@/lib/api";
import type { PendingAction } from "@/types";

interface ToolConfirmResponse {
  executed: boolean;
  summary: string;
  created?: { id: string; name: string; image_url?: string; cutout_url?: string | null }[];
  failed?: { name: string; reason: string }[];
  result_image_url?: string | null;
  result_id?: string | null;
}

export interface PendingActionResult {
  status: "confirmed" | "cancelled";
  summary: string;
  toolName?: string;
  created?: ToolConfirmResponse["created"];
  failed?: ToolConfirmResponse["failed"];
  resultImageUrl?: string;
  resultId?: string;
}

interface Props {
  action: PendingAction;
  onResolve: (result: PendingActionResult) => void;
}

function estimateSeconds(toolName: string, costCredits?: number | null): number {
  if (toolName === "generate_tryon") return 45;
  const itemCount = costCredits ? Math.max(1, Math.round(costCredits / 2)) : 1;
  // Items isolate in parallel — wall clock is closer to one Runway pass + overhead.
  return Math.max(14, 12 + Math.max(0, itemCount - 1) * 3);
}

function processingSteps(toolName: string): string[] {
  if (toolName === "generate_tryon") {
    return [
      "Preparing your avatar",
      "Mapping garment fit",
      "Compositing the look",
      "Applying lighting",
      "Finishing up",
    ];
  }
  return ["Isolating garments", "Cleaning product photos", "Saving to your closet"];
}

function ActionProcessing({
  toolName,
  startedAt,
  totalSecs,
}: {
  toolName: string;
  startedAt: number;
  totalSecs: number;
}) {
  const steps = processingSteps(toolName);
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));

  useEffect(() => {
    const tick = setInterval(() => {
      setSecs(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(tick);
  }, [startedAt]);

  const stepIdx = Math.min(Math.floor(secs / Math.max(3, Math.floor(totalSecs / steps.length))), steps.length - 1);
  const barPct = Math.min(92, Math.round((secs / totalSecs) * 92));
  const remaining = Math.max(0, totalSecs - secs);
  const label = toolName === "generate_tryon" ? "Generating try-on" : "Adding to wardrobe";

  return (
    <div className="mt-3 pt-3 border-t border-border" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-ink mb-2">
        <Loader2 size={14} className="spin shrink-0" />
        <span className="font-medium">{label}…</span>
      </div>
      <p className="text-xs text-muted m-0 mb-2">{steps[stepIdx]}</p>
      <div className="h-1 rounded-full overflow-hidden bg-surface2">
        <div
          className="h-full bg-ink transition-[width] duration-1000 ease-linear"
          style={{ width: `${barPct}%` }}
        />
      </div>
      <p className="text-2xs font-mono text-muted mt-1.5 mb-0">
        ~{remaining}s left · {secs}s elapsed
        {secs > totalSecs ? " — still working, queue may be busy" : ""}
      </p>
    </div>
  );
}

export function PendingActionCard({ action, onResolve }: Props) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const totalSecs = estimateSeconds(action.toolName, action.costCredits);

  if (action.status !== "pending" && !busy) return null;

  async function respond(decision: "confirm" | "cancel") {
    if (decision === "confirm") setStartedAt(Date.now());
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
        toolName: action.toolName,
        created: res.created,
        failed: res.failed,
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
      setStartedAt(null);
    }
  }

  const processing = busy === "confirm" && startedAt !== null;

  return (
    <div className="agent-action-card mt-3">
      <p className="text-sm text-ink m-0">{action.summary}</p>
      {typeof action.costCredits === "number" && !processing && (
        <p className="text-2xs text-muted mt-1 mb-0">~{action.costCredits} credits</p>
      )}

      {processing ? (
        <ActionProcessing toolName={action.toolName} startedAt={startedAt} totalSecs={totalSecs} />
      ) : (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => respond("confirm")}
            disabled={busy !== null}
          >
            <Check size={12} />
            Confirm
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => respond("cancel")}
            disabled={busy !== null}
          >
            {busy === "cancel" ? <Loader2 size={12} className="spin" /> : <X size={12} />}
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
