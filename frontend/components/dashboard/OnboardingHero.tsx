"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Camera, Sparkles } from "lucide-react";

export function OnboardingHero() {
  return (
    <div
      className="surface overflow-hidden relative flex items-center justify-center min-h-[220px]"
      style={{
        width: "100%",
        background: "linear-gradient(135deg, var(--surface2) 0%, var(--bg) 100%)",
      }}
    >
      <div className="text-center px-6 max-w-lg py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h2 className="font-display text-2xl md:text-3xl mb-2 text-foreground">
            Know what flatters you
          </h2>
          <p className="text-sm text-muted mb-6">
            Upload face + full-body photos in natural light. We&apos;ll read your color season and Kibbe type — then Aria judges every item you own or shop.
          </p>
          <Link href="/onboarding" className="btn-primary inline-flex items-center gap-2">
            <Camera size={16} />
            Start style profile
          </Link>
          <p className="text-xs text-muted mt-4 flex items-center justify-center gap-1">
            <Sparkles size={12} /> Try-on is optional proof — advice is free
          </p>
        </motion.div>
      </div>
    </div>
  );
}
