"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Camera, Sparkles, Shirt, User } from "lucide-react";

export function OnboardingHero() {
  return (
    <div
      className="surface overflow-hidden relative flex items-center justify-center"
      style={{
        width: "100%",
        aspectRatio: "16/9",
        background: "linear-gradient(135deg, var(--surface2) 0%, var(--bg) 100%)",
      }}
    >
      <div className="text-center px-6 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <h2 className="font-display text-3xl md:text-4xl mb-3" style={{ color: "var(--ink)" }}>
            Welcome to StyleSense
          </h2>
          <p className="text-sm md:text-base mb-6" style={{ color: "var(--text-muted)" }}>
            Upload your first selfie to unlock the full experience
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <Link href="/settings" className="btn-primary inline-flex items-center gap-2 mb-8">
            <Camera size={16} />
            Get Started
          </Link>
        </motion.div>

        <motion.div
          className="grid grid-cols-3 gap-4 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          {[
            { icon: User, label: "Studio", desc: "Try on clothes" },
            { icon: Shirt, label: "Wardrobe", desc: "Your closet" },
            { icon: Sparkles, label: "Stylist", desc: "AI advice" },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-2 p-3 rounded" style={{ background: "var(--surface)" }}>
              <item.icon size={20} style={{ color: "var(--text-muted)" }} />
              <div className="text-xs font-medium" style={{ color: "var(--text)" }}>{item.label}</div>
              <div className="text-2xs" style={{ color: "var(--text-dim)" }}>{item.desc}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
