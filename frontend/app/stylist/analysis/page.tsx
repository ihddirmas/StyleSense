"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Palette, User, Droplet } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiGet } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";

interface Swatch {
  name: string;
  hex: string;
}

interface AnalysisReport {
  ready: boolean;
  has_color?: boolean;
  has_kibbe?: boolean;
  has_photo?: boolean;
  color?: {
    season: string | null;
    undertone: string | null;
    contrast: string | null;
    flattering_colors: string[];
    avoid_colors: string[];
    swatches: Swatch[];
    source?: string;
  };
  kibbe?: {
    type: string | null;
    type_display: string;
    style_essence: string;
    best_lines: string;
    best_fabrics: string;
    avoid: string;
  };
  skin?: {
    has_skin: boolean;
    colors: Record<string, string>;
  };
  narrative?: string;
}

const SKIN_TONE_LABELS: Record<string, string> = {
  skin_color: "Skin",
  hair_color: "Hair",
  eye_color: "Eyes",
  lip_color: "Lips",
};

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default function StyleAnalysisPage() {
  const { user } = useAuth();
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    apiGet<AnalysisReport>("/api/stylist/analysis-report")
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8">
      <div className="max-w-3xl w-full mx-auto">
        <PageHeader
          eyebrow="Your Style Report"
          title="Color & Body-Type Analysis"
          subtitle="Grounded in seasonal color theory and Kibbe body typing — the same frameworks professional stylists use. Free, and yours whenever you want a refresher."
        />

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="surface p-6" style={{ minHeight: 220 }}>
                <div className="shimmer h-4 w-24 rounded mb-4" />
                <div className="shimmer h-6 w-40 rounded mb-3" />
                <div className="shimmer h-3 w-full rounded mb-2" />
                <div className="shimmer h-3 w-3/4 rounded" />
              </div>
            ))}
          </div>
        ) : !report || !report.ready ? (
          <div className="surface p-10 text-center text-muted">
            <Sparkles size={28} className="mx-auto mb-3 text-dim" />
            <p className="text-sm mb-1">
              {report?.has_color || report?.has_kibbe
                ? "Almost there — finish your profile to unlock your report."
                : report?.has_photo
                ? "We have your photo — your color & Kibbe analysis hasn't finished yet. Check back shortly, or re-upload in Settings if it's been a while."
                : "Upload a selfie and a full-body photo to unlock your report."}
            </p>
            <p className="text-xs mb-5">
              {report?.has_color ? "✓ Color profile ready" : "Color profile not analyzed yet"}
              {" · "}
              {report?.has_kibbe ? "✓ Body-type profile ready" : "Body-type profile not analyzed yet"}
            </p>
            <Link
              href="/settings"
              className="surface surface-hover px-4 py-2 text-sm inline-flex items-center gap-2"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              Complete your profile <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Color season card */}
              <div className="surface p-6">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
                    <Palette size={13} /> Color Season
                  </div>
                  {report.color?.source === "youcam_measured" && (
                    <span
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: "var(--gold-dim)", color: "var(--gold)" }}
                    >
                      YouCam‑measured
                    </span>
                  )}
                </div>
                <p className="font-display text-2xl mb-1">
                  {titleCase(report.color?.season || "Unknown")}
                </p>
                <p className="text-sm text-muted mb-4">
                  {titleCase(report.color?.undertone || "")} undertone
                  {report.color?.contrast ? ` · ${report.color.contrast} contrast` : ""}
                </p>

                {!!report.color?.swatches?.length && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {report.color.swatches.map((s) => (
                      <div
                        key={s.name}
                        title={s.name}
                        className="h-8 w-8 rounded-full border border-border"
                        style={{ background: s.hex }}
                      />
                    ))}
                  </div>
                )}

                {!!report.color?.flattering_colors?.length && (
                  <p className="text-xs text-muted mb-1">
                    <span className="text-foreground">Flattering:</span>{" "}
                    {report.color.flattering_colors.join(", ")}
                  </p>
                )}
                {!!report.color?.avoid_colors?.length && (
                  <p className="text-xs text-muted">
                    <span className="text-foreground">Avoid:</span> {report.color.avoid_colors.join(", ")}
                  </p>
                )}
              </div>

              {/* Kibbe body-type card */}
              <div className="surface p-6">
                <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider text-muted">
                  <User size={13} /> Body-Type Line
                </div>
                <p className="font-display text-2xl mb-1">{report.kibbe?.type_display || "Unknown"}</p>
                {report.kibbe?.style_essence && (
                  <p className="text-sm text-muted mb-4">{report.kibbe.style_essence}</p>
                )}
                {report.kibbe?.best_lines && (
                  <p className="text-xs text-muted mb-1">
                    <span className="text-foreground">Best lines:</span> {report.kibbe.best_lines}
                  </p>
                )}
                {report.kibbe?.best_fabrics && (
                  <p className="text-xs text-muted mb-1">
                    <span className="text-foreground">Best fabrics:</span> {report.kibbe.best_fabrics}
                  </p>
                )}
                {report.kibbe?.avoid && (
                  <p className="text-xs text-muted">
                    <span className="text-foreground">Avoid:</span> {report.kibbe.avoid}
                  </p>
                )}
              </div>
            </div>

            {/* Skin tones (YouCam Skin AI) — the measured input the Color Season card above is grounded in */}
            <div className="surface p-6">
              <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider text-muted">
                <Droplet size={13} /> Skin Tones · YouCam Skin AI
              </div>
              {report.skin?.has_skin ? (
                <>
                  <div className="flex flex-wrap gap-4 mb-3">
                    {Object.entries(report.skin.colors)
                      .filter(([, hex]) => !!hex)
                      .map(([key, hex]) => (
                        <div key={key} className="flex flex-col items-center gap-1.5">
                          <div
                            className="h-9 w-9 rounded-full border border-border"
                            style={{ background: hex }}
                          />
                          <span className="text-[11px] text-muted">{SKIN_TONE_LABELS[key] || titleCase(key)}</span>
                        </div>
                      ))}
                  </div>
                  <p className="text-xs text-muted">
                    Measured from your selfie via YouCam&apos;s Skin AI — these tones are what your Color Season above is grounded in, not a guess.
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted">
                    Run YouCam&apos;s Skin AI on your selfie to ground your Color Season in measured tones instead of an estimate.
                  </p>
                  <Link
                    href="/settings"
                    className="surface surface-hover px-3 py-1.5 text-xs inline-flex items-center gap-1.5 shrink-0"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    Analyze my skin <ArrowRight size={12} />
                  </Link>
                </div>
              )}
            </div>

            {report.narrative && (
              <div className="surface p-6" style={{ borderLeft: "3px solid var(--gold)" }}>
                <p className="font-display text-lg leading-relaxed">{report.narrative}</p>
              </div>
            )}

            <Link
              href="/wardrobe"
              className="surface surface-hover p-4 flex items-center justify-between gap-3"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className="text-sm">See outfit ideas already in your closet, matched to this profile</span>
              <ArrowRight size={16} className="shrink-0" />
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
