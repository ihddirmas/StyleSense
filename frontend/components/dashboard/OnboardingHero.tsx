"use client";
import Link from "next/link";
import { Camera } from "lucide-react";

export function OnboardingHero() {
  return (
    <div
      className="surface overflow-hidden relative flex flex-col items-center justify-center text-center px-6 py-10 sm:py-14"
      style={{
        width: "100%",
        aspectRatio: "16/9",
        background: "linear-gradient(180deg, var(--surface2) 0%, var(--bg) 100%)",
      }}
    >
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: "var(--surface2)", border: "1px solid var(--border-hover)" }}
      >
        <Camera size={22} style={{ color: "var(--gold)" }} />
      </div>
      <h2 className="font-display text-lg sm:text-xl mb-2" style={{ color: "var(--text)" }}>
        Start your digital runway
      </h2>
      <p className="text-xs sm:text-sm max-w-sm mb-5" style={{ color: "var(--text-muted)" }}>
        Upload a selfie to see yourself in outfits and generate your ramp-walk hero video.
      </p>
      <Link
        href="/onboarding"
        className="px-4 py-2 rounded-full text-xs sm:text-sm font-semibold"
        style={{
          background: "var(--gold)",
          color: "var(--on-gold)",
          textDecoration: "none",
          boxShadow: "0 8px 24px -8px rgba(0,0,0,0.7)",
        }}
      >
        Upload your selfie
      </Link>
    </div>
  );
}
