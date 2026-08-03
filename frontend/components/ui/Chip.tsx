import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

export function Chip({ active = false, className = "", children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      className={`chip ${active ? "chip-active" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
