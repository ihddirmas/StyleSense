"use client";

import { AlertTriangle, Check, HelpCircle, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LookCheck, LookCheckStatus, LookCheckVerdict } from "@/types";

const VERDICT_COPY: Record<LookCheckVerdict, { title: string; className: string }> = {
  wear: { title: "Wear it", className: "text-status-pass" },
  tweak: { title: "Worth a tweak", className: "text-status-warn" },
  skip: { title: "Skip it", className: "text-status-fail" },
};

const STATUS_STYLE: Record<LookCheckStatus, { Icon: LucideIcon; word: string; className: string }> = {
  pass: { Icon: Check, word: "Pass", className: "text-status-pass" },
  warn: { Icon: AlertTriangle, word: "Warning", className: "text-status-warn" },
  fail: { Icon: X, word: "Fail", className: "text-status-fail" },
  unknown: { Icon: HelpCircle, word: "Not enough data", className: "text-muted" },
};

export function formatReason(reason: string): string {
  return reason
    .replace(/ -- /g, " — ")
    .replace(/\bdE (\d)/g, "ΔE $1")
    .replace(/(\d)C\b/g, "$1°C");
}

export function LookCheckCard({ check }: { check: LookCheck }) {
  const verdict = VERDICT_COPY[check.verdict];
  const measuredCount = check.checks.length - check.unknowns.length;
  const itemNames = (check.items ?? []).map((item) => item.name).join(" + ");

  return (
    <section
      aria-label={`Look check: ${verdict.title}`}
      className="mt-3 rounded-lg border border-border bg-surface-2 p-3 sm:p-4"
    >
      <p className="text-2xs uppercase tracking-wider text-muted m-0">Look check</p>
      <p className={`font-display text-3xl leading-tight m-0 mt-0.5 ${verdict.className}`}>{verdict.title}</p>
      {itemNames && <p className="text-xs text-muted m-0 mt-1">{itemNames}</p>}

      <ul className="list-none p-0 m-0 mt-3">
        {check.checks.map((row) => {
          const { Icon, word, className } = STATUS_STYLE[row.status];
          const notable = row.findings.filter((f) => f.status === "fail" || f.status === "warn");
          const shown = notable.length > 0 ? notable : row.findings.slice(0, 1);
          return (
            <li key={row.check} className="flex gap-2 border-t border-border/60 py-2 text-sm">
              <Icon size={14} className={`mt-0.5 shrink-0 ${className}`} aria-label={word} role="img" />
              <div className="min-w-0">
                <p className="font-medium text-foreground m-0 text-xs">{row.label}</p>
                {shown.map((finding) => (
                  <p key={finding.reason} className="text-xs text-muted m-0 mt-0.5 leading-relaxed">
                    {formatReason(finding.reason)}
                  </p>
                ))}
                {shown.length === 0 && <p className="text-xs text-muted m-0 mt-0.5">{word}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-2xs text-muted m-0 mt-1 pt-2 border-t border-border/60">
        {measuredCount} of {check.checks.length} checks had data
        {check.measured_skin ? " · Skin tone measured by YouCam Skin AI" : " · No measured skin tone yet"}
        {check.garment_colors_measured ? " · Garment colors measured" : " · Garment colors estimated from their names"}
      </p>
    </section>
  );
}
