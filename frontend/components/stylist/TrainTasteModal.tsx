"use client";

import { X } from "lucide-react";
import ThisOrThat from "@/components/stylist/ThisOrThat";

export default function TrainTasteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Train Aria&apos;s taste</h2>
            <p className="mt-1 text-sm text-muted">
              Quick picks update what Aria knows you prefer — used in every chat reply.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ThisOrThat />
      </div>
    </div>
  );
}
