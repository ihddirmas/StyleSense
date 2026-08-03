"use client";

import { Archive } from "lucide-react";

export function MediaProvenanceBanner({
  imageManifestHash,
  videoManifestHash,
  b2ImageUrl,
  b2VideoUrl,
  compact,
}: {
  imageManifestHash?: string | null;
  videoManifestHash?: string | null;
  b2ImageUrl?: string | null;
  b2VideoUrl?: string | null;
  compact?: boolean;
}) {
  const hash = videoManifestHash || imageManifestHash;
  const url = b2VideoUrl || b2ImageUrl;
  if (!hash && !url) return null;

  const short = hash ? `${hash.slice(0, 12)}…` : null;

  if (compact) {
    return (
      <p className="text-2xs text-muted flex items-center gap-1.5 mt-2 mb-0">
        <Archive size={12} className="shrink-0" />
        Archived on Backblaze B2 via Genblaze
        {short && <span className="font-mono">· {short}</span>}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted">
      <div className="flex items-center gap-2 text-foreground font-medium mb-1">
        <Archive size={14} className="shrink-0 text-accent" />
        Durable archive (Backblaze B2 + Genblaze)
      </div>
      <p className="m-0 leading-relaxed">
        This media was stored with a SHA-256 provenance manifest — not just a short-lived Runway CDN link.
      </p>
      {short && (
        <p className="m-0 mt-1.5 font-mono text-2xs break-all">
          manifest {hash}
        </p>
      )}
      {url && (
        <p className="m-0 mt-1 text-2xs truncate" title={url}>
          B2: {url}
        </p>
      )}
    </div>
  );
}
