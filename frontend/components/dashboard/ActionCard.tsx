import Link from "next/link";
import type { ReactNode } from "react";

interface ActionCardProps {
  href: string;
  icon: ReactNode;
  title: string;
  desc?: string;
  compact?: boolean;
}

export function ActionCard({ href, icon, title, desc, compact = false }: ActionCardProps) {
  return (
    <Link
      href={href}
      className={`action-card surface surface-hover block h-full ${compact ? "action-card-compact" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="action-card-icon shrink-0" aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`font-display leading-tight text-ink ${compact ? "text-sm" : "text-base sm:text-lg"}`}>
            {title}
          </div>
          {desc && <p className="text-xs mt-1.5 leading-snug text-muted">{desc}</p>}
        </div>
      </div>
    </Link>
  );
}
