"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function ThinkingIndicator({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const steps = [
    { at: 0, label: "Reading your message" },
    { at: 2, label: "Checking wardrobe & preferences" },
    { at: 5, label: "Choosing tools" },
    { at: 10, label: "Composing reply" },
  ];
  const step = [...steps].reverse().find((s) => elapsed >= s.at) ?? steps[0];

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
        <div className="flex items-center gap-2 text-foreground">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
          <span className="font-medium">Aria is thinking</span>
          <span className="text-xs text-muted">· {elapsed}s</span>
        </div>
        <p className="mt-1.5 text-xs text-muted">{step.label}…</p>
      </div>
    </div>
  );
}
