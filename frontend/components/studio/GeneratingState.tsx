"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  "Analyzing your avatar...",
  "Detecting garment shape and texture...",
  "Compositing outfit on body...",
  "Applying studio lighting...",
  "Finishing details...",
];

const TOTAL = 32; // nominal seconds for the progress estimate

// `startedAt` (task start timestamp) makes the progress continuous across page
// navigation: on remount we recompute elapsed from it instead of restarting at 0.
export function GeneratingState({
  avatarUrl,
  itemUrls,
  startedAt,
}: {
  avatarUrl: string | null;
  itemUrls: string[];
  startedAt?: number;
}) {
  const elapsed = () => (startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0);
  const [secs, setSecs] = useState(elapsed);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecs((s) => (startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : s + 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [startedAt]);

  const stepIdx = Math.min(Math.floor(secs / 6), STEPS.length - 1);
  const barPct = Math.min(92, Math.round((secs / TOTAL) * 92));

  return (
    <div className="surface p-8 flex flex-col items-center text-center" style={{ minHeight: 480 }}>
      {/* Visual: selfie + items orbiting around a sparkle */}
      <div className="flex items-center gap-6 mb-6">
        {avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="You" className="rounded-full object-cover"
               style={{ width: 80, height: 80, border: "1px solid var(--border-gold)" }} />
        )}
        <motion.span
          className="font-display text-3xl"
          style={{ color: "var(--gold)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          ✦
        </motion.span>
        <div className="flex gap-2">
          {itemUrls.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt={`Item ${i + 1}`} className="rounded-md object-cover"
                 style={{ width: 80, height: 80, border: "1px solid var(--border)" }} />
          ))}
        </div>
      </div>

      <div className="font-display text-2xl mb-2">Composing your look</div>
      <AnimatePresence mode="wait">
        <motion.div
          key={stepIdx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="text-sm mb-6"
          style={{ color: "var(--text-muted)" }}
        >
          {STEPS[stepIdx]}
        </motion.div>
      </AnimatePresence>

      {/* Progress bar — width derived from elapsed so it survives remounts */}
      <div className="w-full max-w-md mb-3">
        <div style={{ height: 4, background: "rgba(60,36,21,0.15)", borderRadius: 999, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${barPct}%`,
              background: "var(--ink)",
              transition: "width 1s linear",
            }}
          />
        </div>
        <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          ~{Math.max(0, TOTAL - secs)}s remaining · {secs}s elapsed
        </div>
      </div>

      {/* Step list */}
      <div className="w-full max-w-md text-left mt-4">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 text-xs py-1" style={{ color: i <= stepIdx ? "var(--ink)" : "var(--text-muted)" }}>
            <span style={{
              width: 12, textAlign: "center",
              color: i < stepIdx ? "var(--green)" : i === stepIdx ? "var(--ink)" : "var(--text-muted)",
            }}>
              {i < stepIdx ? "✓" : i === stepIdx ? "⟳" : "·"}
            </span>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
