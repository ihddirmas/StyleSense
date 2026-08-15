"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Sparkles, User } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useAppStore } from "@/store/app";
import { apiGet } from "@/lib/api";

interface SuggestedItem {
  id: string;
  name: string;
  color: string | null;
  category: string;
  image_url: string;
}

interface OutfitSuggestion {
  items: SuggestedItem[];
  caption: string;
  score: number;
  kibbe_note?: string | null;
}

interface Props {
  hasItems: boolean;
}

export function OutfitSuggestions({ hasItems }: Props) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<OutfitSuggestion[] | null>(null);
  const { ariaImageUrl, ariaName, setAria } = useAppStore();

  useEffect(() => {
    if (!user || !hasItems) return;
    apiGet<{ suggestions: OutfitSuggestion[] }>("/api/wardrobe/outfit-suggestions")
      .then((d) => setSuggestions(d.suggestions))
      .catch(() => setSuggestions([]));
  }, [user, hasItems]);

  // Fetch Aria's portrait once if not already cached (e.g. user landed on
  // /wardrobe first, before /dashboard's HeroVideo populated the store).
  useEffect(() => {
    if (!user || ariaImageUrl) return;
    apiGet<{ image_url: string | null; hero_video_url: string | null; name: string | null }>("/api/avatar/stylist")
      .then((d) => setAria(d.hero_video_url, d.image_url, d.name))
      .catch(() => {});
  }, [user, ariaImageUrl, setAria]);

  if (!hasItems || suggestions === null) return null;

  if (suggestions.length === 0) {
    return (
      <div className="surface p-4 mb-4 text-sm text-muted flex items-center gap-2">
        <Sparkles size={14} className="shrink-0" />
        Add at least one top and bottom (or a dress) to see outfit pairings from your own closet.
      </div>
    );
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
          {ariaImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ariaImageUrl} alt={ariaName || "Aria"} className="rounded-full object-cover" style={{ width: 16, height: 16 }} />
          ) : (
            <Sparkles size={13} />
          )}
          {ariaName || "Aria"} picked these from your closet
        </div>
        <Link href="/stylist/analysis" className="text-xs text-muted hover:underline">
          Why these? →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {suggestions.map((combo, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="surface shrink-0 p-3"
            style={{ width: 220 }}
          >
            <div className="flex gap-1.5 mb-2">
              {combo.items.map((item) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={item.id}
                  src={item.image_url}
                  alt={item.name}
                  className="flex-1 aspect-square object-cover rounded"
                  style={{ minWidth: 0 }}
                />
              ))}
            </div>
            <p className="text-xs text-foreground leading-snug">{combo.caption}</p>
            {combo.kibbe_note && (
              <p
                className="text-[10px] leading-snug flex items-start gap-1 mt-1.5 pt-1.5"
                style={{ color: "var(--gold)", borderTop: "1px solid var(--border)" }}
              >
                <User size={10} className="shrink-0 mt-0.5" />
                {combo.kibbe_note}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
