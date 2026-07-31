"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TryOnResult } from "@/types";

const AUTOPLAY_MS = 3500;

/**
 * Auto-advancing showcase of the user's recent try-ons for the dashboard.
 * Crossfades one look at a time, pauses on hover, and exposes dot navigation.
 * Sized to its container via the `aspect` prop so it fits both the wide hero
 * column and the narrow archive rail.
 */
export function TryOnCarousel({
  results,
  aspect = "4/5",
  onOpen,
}: {
  results: TryOnResult[];
  aspect?: string;
  onOpen?: (r: TryOnResult) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const count = results.length;

  const go = useCallback((next: number) => setIndex((next + count) % count), [count]);

  useEffect(() => {
    if (paused || count <= 1) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [paused, count]);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  if (count === 0) return null;
  const current = results[index];
  const Tag = onOpen ? "button" : "div";

  return (
    <div
      className="surface overflow-hidden"
      style={{ padding: 0 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative w-full" style={{ aspectRatio: aspect, background: "var(--surface2)" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            <Tag
              onClick={onOpen ? () => onOpen(current) : undefined}
              className="w-full h-full block text-left group"
              style={{ padding: 0, border: "none", background: "none", cursor: onOpen ? "pointer" : "default" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.event_scene_url || current.result_image_url}
                alt="Try-on"
                className="w-full h-full object-cover"
              />
              {current.event_context && (
                <div
                  className="absolute inset-x-0 bottom-0 px-3 py-2"
                  style={{ background: "linear-gradient(to top, rgba(8,8,13,0.78) 0%, rgba(8,8,13,0) 100%)" }}
                >
                  <div className="text-xs truncate" style={{ color: "#fff" }}>✦ {current.event_context}</div>
                </div>
              )}
            </Tag>
          </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2">
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => go(i)}
              aria-label={`Show try-on ${i + 1}`}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 18 : 6,
                height: 6,
                background: i === index ? "var(--gold)" : "var(--border)",
                border: "none",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
