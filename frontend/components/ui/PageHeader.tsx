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
  titleSize?: "default" | "responsive";
  tutorialKey?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  titleSize = "default",
  tutorialKey,
}: PageHeaderProps) {
  const [seen, markSeen] = useSeenOnce(tutorialKey ?? "");
  const [dismissed, setDismissed] = useState(false);
  const showSubtitle = !!subtitle && (!tutorialKey || (!seen && !dismissed));

  const titleClass =
    titleSize === "responsive"
      ? "font-display text-2xl sm:text-3xl md:text-4xl leading-tight text-ink"
      : "font-display text-3xl md:text-4xl leading-tight text-ink";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 sm:gap-4 mb-5"
    >
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <div className={title ? "eyebrow mb-2" : "eyebrow text-sm"}>{eyebrow}</div>
        )}
        {title && <h1 className={titleClass}>{title}</h1>}
        {showSubtitle && (
          <div className="mt-3 flex items-start gap-2 max-w-xl">
            <p className="flex-1 text-sm text-ink/90">{subtitle}</p>
            {tutorialKey && (
              <button
                type="button"
                onClick={() => {
                  setDismissed(true);
                  markSeen();
                }}
                aria-label="Dismiss hint"
                className="icon-btn shrink-0"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      {action && <div className="shrink-0 sm:ml-2">{action}</div>}
    </motion.div>
  );
}
