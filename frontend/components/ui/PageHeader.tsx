"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useSeenOnce } from "@/lib/useSeenOnce";

interface PageHeaderProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  // When set, the subtitle is a first-visit hint: auto-hidden on subsequent
  // visits (localStorage) and closeable via ✕ during the current visit.
  tutorialKey?: string;
}

export function PageHeader({ eyebrow, title, subtitle, action, tutorialKey }: PageHeaderProps) {
  const seen = useSeenOnce(tutorialKey ?? "");
  const [dismissed, setDismissed] = useState(false);
  const showSubtitle = !!subtitle && (!tutorialKey || (!seen && !dismissed));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="flex items-end justify-between mb-5"
    >
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <div
            className={title ? "text-xs mb-2" : "text-sm"}
            style={{
              color: "var(--text-muted)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </div>
        )}
        {title && <h1 className="font-display text-4xl leading-tight">{title}</h1>}
        {showSubtitle && (
          <div className="mt-3 flex items-start gap-2 max-w-xl">
            <p className="flex-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
            {tutorialKey && (
              <button
                onClick={() => setDismissed(true)}
                aria-label="Dismiss hint"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-dim)",
                  padding: "2px",
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </motion.div>
  );
}
