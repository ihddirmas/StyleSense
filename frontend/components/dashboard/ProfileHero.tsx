"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { OnboardingHero } from "./OnboardingHero";

interface ColorProfile {
  season?: string;
  undertone?: string;
  contrast?: string;
  confidence?: number;
  lighting_quality?: string;
  flattering_colors?: string[];
  avoid_colors?: string[];
  notes?: string;
  limitations?: string[];
}

interface KibbeAnalysis {
  kibbe_type?: string;
  confidence?: number;
  vertical_line?: string;
  notes?: string;
  limitations?: string[];
}

function confidenceLabel(c?: number) {
  if (c == null) return null;
  if (c >= 0.75) return "High confidence";
  if (c >= 0.55) return "Medium confidence — take with a grain of salt";
  return "Low confidence — retake in natural light";
}

export function ProfileHero() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState<ColorProfile | null>(null);
  const [kibbe, setKibbe] = useState<KibbeAnalysis | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiGet<{ color_profile: ColorProfile | null; kibbe_analysis: KibbeAnalysis | null }>(
      "/api/stylist/profiles"
    )
      .then((d) => {
        if (cancelled) return;
        setColor(d.color_profile);
        setKibbe(d.kibbe_analysis);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="surface flex items-center justify-center p-10 min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (!color && !kibbe) {
    return <OnboardingHero />;
  }

  const season = color?.season ? String(color.season).replace(/^./, (c) => c.toUpperCase()) : null;
  const kibbeDisplay = kibbe?.kibbe_type
    ? String(kibbe.kibbe_type).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div className="surface p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="section-label mb-1">Your style profile</p>
          <h2 className="font-display text-2xl md:text-3xl text-foreground">
            {season ? `${season} color season` : "Color analysis pending"}
          </h2>
          {kibbeDisplay && (
            <p className="text-sm text-muted mt-1">Kibbe: {kibbeDisplay}</p>
          )}
        </div>
        <Sparkles className="h-5 w-5 shrink-0 text-accent opacity-80" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        {color && (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs uppercase tracking-wider text-muted mb-2">Color</p>
            <p className="text-foreground">
              {color.undertone} undertone · {color.contrast} contrast
            </p>
            {color.confidence != null && (
              <p className="text-xs text-muted mt-1">{confidenceLabel(color.confidence)}</p>
            )}
            {color.flattering_colors && color.flattering_colors.length > 0 && (
              <p className="text-xs mt-2 text-muted">
                Wear: {color.flattering_colors.slice(0, 5).join(", ")}
              </p>
            )}
          </div>
        )}
        {kibbe && (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs uppercase tracking-wider text-muted mb-2">Silhouette</p>
            <p className="text-foreground capitalize">{kibbeDisplay}</p>
            {kibbe.vertical_line && (
              <p className="text-xs text-muted mt-1">Vertical line: {kibbe.vertical_line}</p>
            )}
            {kibbe.confidence != null && (
              <p className="text-xs text-muted mt-1">{confidenceLabel(kibbe.confidence)}</p>
            )}
          </div>
        )}
      </div>

      {(!kibbe || (color?.confidence != null && color.confidence < 0.65)) && (
        <p className="text-xs text-muted mt-4">
          {!kibbe
            ? "Add a full-body photo in Settings for Kibbe typing."
            : "Retake your selfie in natural daylight for a sharper season read."}
        </p>
      )}

      <Link href="/stylist" className="btn-primary btn-sm mt-4 inline-flex">
        Ask Aria about an item
      </Link>
    </div>
  );
}
