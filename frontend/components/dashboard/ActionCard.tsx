import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
      className={`action-card surface ${compact ? "action-card-compact" : ""}`}
    >
      <div className={`action-card-body ${compact ? "action-card-body-compact" : ""}`}>
        <div className="action-card-icon shrink-0" aria-hidden>
          {icon}
        </div>
        <div className="action-card-copy min-w-0 flex-1">
          <div className={`font-display leading-tight text-ink ${compact ? "text-sm" : "text-lg"}`}>
            {title}
          </div>
          {desc && <p className="action-card-desc">{desc}</p>}
        </div>
        {!compact && <ChevronRight size={16} className="action-card-chevron shrink-0" aria-hidden />}
      </div>
    </Link>
  );
}
