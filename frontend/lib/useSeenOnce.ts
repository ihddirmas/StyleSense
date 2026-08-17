"use client";
import { useCallback, useEffect, useState } from "react";

// One-time hint gating. Returns `[seen, markSeen]`:
//   seen     — true once this hint was marked seen in an EARLIER visit. Reading
//              is all that happens on mount, so a hint the user never actually
//              laid eyes on is never consumed.
//   markSeen — persists "seen" for future visits. Write-only by design: it does
//              NOT flip `seen` for the current render, because callers that mark
//              on render (a passive hint with no dismiss button) would otherwise
//              re-render it straight back out of existence. Hiding the hint for
//              the rest of this session stays the caller's job, via its own
//              dismissed flag.
// SSR-safe: defaults to "not seen" until mounted, avoiding a hydration mismatch.
// An empty key is a no-op — always shows the hint, never persists anything.
export function useSeenOnce(key: string): [boolean, () => void] {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (!key) return;
    try {
      if (localStorage.getItem(`ss_seen_${key}`)) setSeen(true);
    } catch {
      // localStorage unavailable — always show the hint
    }
  }, [key]);

  const markSeen = useCallback(() => {
    if (!key) return;
    try {
      localStorage.setItem(`ss_seen_${key}`, "1");
    } catch {
      // localStorage unavailable — dismissal just won't survive a reload
    }
  }, [key]);

  return [seen, markSeen];
}
