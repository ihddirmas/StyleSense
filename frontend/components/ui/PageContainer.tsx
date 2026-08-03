import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  /** default: scrollable app page; full: no max-width (e.g. Studio grid) */
  width?: "default" | "full";
  className?: string;
}

export function PageContainer({ children, width = "default", className = "" }: PageContainerProps) {
  const widthClass = width === "full" ? "max-w-none" : "max-w-page";
  return (
    <div className={`page-shell ${widthClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
