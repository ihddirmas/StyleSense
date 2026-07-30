"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Check, AlertCircle, Plus } from "lucide-react";
import type { DetectedItem, StylistWardrobeConfirmResponse } from "@/types";

interface Props {
  detected: DetectedItem[];
  sourceImageUrl: string;
  onClose: () => void;
  onConfirm: (items: DetectedItem[]) => Promise<StylistWardrobeConfirmResponse>;
}

export function AddToWardrobeModal({ detected, sourceImageUrl, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(detected.map((_, i) => i))
  );
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<StylistWardrobeConfirmResponse | null>(null);

  function toggleItem(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleConfirm() {
    const items = detected.filter((_, i) => selected.has(i));
    if (items.length === 0) return;
    setProcessing(true);
    try {
      const res = await onConfirm(items);
      setResult(res);
    } catch (e) {
      console.error(e);
      setResult({
        created: [],
        failed: items.map((it) => ({ name: it.name, reason: "Network error" })),
        summary: "",
      });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="surface max-w-lg w-full max-h-[90vh] overflow-y-auto"
        style={{ padding: 0 }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div className="font-display text-xl leading-none">Add to Wardrobe</div>
            <div
              className="text-2xs uppercase tracking-widest mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              {result
                ? "Done"
                : processing
                ? "Processing..."
                : `${detected.length} item${detected.length !== 1 ? "s" : ""} detected`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-dim)",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {result ? (
          <div className="p-5 space-y-3">
            {result.created.length > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <Check size={16} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ color: "var(--text)" }}>
                    Added {result.created.length} item{result.created.length !== 1 ? "s" : ""}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)", marginTop: 4 }}>
                    {result.created.map((it) => it.name).join(", ")}
                  </div>
                </div>
              </div>
            )}
            {result.failed.length > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <AlertCircle
                  size={16}
                  style={{ color: "var(--text-dim)", flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <div style={{ color: "var(--text-dim)" }}>
                    {result.failed.length} failed
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)", marginTop: 4 }}>
                    {result.failed.map((f) => f.name).join(", ")}
                  </div>
                </div>
              </div>
            )}
            <button className="btn-primary w-full" onClick={onClose} style={{ marginTop: 16 }}>
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Preview image */}
            <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceImageUrl}
                alt="Source"
                style={{
                  width: "100%",
                  maxHeight: 200,
                  objectFit: "contain",
                  border: "1px solid var(--border)",
                }}
              />
            </div>

            {/* Item checklist */}
            <div className="p-5 space-y-2">
              {detected.map((item, i) => (
                <label
                  key={i}
                  className="flex items-center gap-3 p-3 cursor-pointer"
                  style={{
                    background: selected.has(i) ? "var(--surface2)" : "transparent",
                    border: `1px solid ${selected.has(i) ? "var(--border)" : "transparent"}`,
                    transition: "background 0.15s, border-color 0.15s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleItem(i)}
                    style={{ flexShrink: 0 }}
                  />
                  <div className="flex-1">
                    <div className="text-sm" style={{ color: "var(--text)" }}>
                      {item.name}
                    </div>
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {item.category}
                      {item.color ? ` · ${item.color}` : ""}
                      {item.brand ? ` · ${item.brand}` : ""}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Actions */}
            <div
              className="flex gap-2 px-5 pb-5"
              style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}
            >
              <button
                className="btn-secondary flex-1"
                onClick={onClose}
                disabled={processing}
              >
                Cancel
              </button>
              <button
                className="btn-primary flex-1"
                onClick={handleConfirm}
                disabled={selected.size === 0 || processing}
              >
                {processing ? (
                  <>
                    <Loader2 size={14} className="spin" /> Processing...
                  </>
                ) : (
                  <>
                    <Plus size={14} /> Add {selected.size} item{selected.size !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
