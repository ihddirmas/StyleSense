"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiGet } from "@/lib/api";
import { useAppStore } from "@/store/app";
import type { WardrobeItem } from "@/types";

/** Stale-while-revalidate wardrobe list — shows cached count immediately after hydration. */
export function useWardrobeItems() {
  const { user } = useAuth();
  const cachedWardrobe = useAppStore((s) => s.cachedWardrobe);
  const setCachedWardrobe = useAppStore((s) => s.setCachedWardrobe);
  const hydrated = useAppStore((s) => s.hydrated);
  const [items, setItems] = useState<WardrobeItem[]>(cachedWardrobe);
  const [synced, setSynced] = useState(cachedWardrobe.length > 0);

  useEffect(() => {
    if (hydrated && cachedWardrobe.length) {
      setItems(cachedWardrobe);
      setSynced(true);
    }
  }, [hydrated, cachedWardrobe]);

  const refresh = useCallback(async () => {
    const data = await apiGet<WardrobeItem[]>("/api/wardrobe");
    setItems(data);
    setCachedWardrobe(data);
    setSynced(true);
    return data;
  }, [setCachedWardrobe]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    refresh()
      .catch(() => {
        if (!cancelled) setSynced(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const countReady = synced || items.length > 0;

  return { items, refresh, count: items.length, countReady };
}
