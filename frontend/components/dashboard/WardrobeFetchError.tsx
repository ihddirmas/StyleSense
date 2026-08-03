"use client";
import { AlertCircle } from "lucide-react";

interface WardrobeFetchErrorProps {
  onRetry: () => void;
  variant?: "empty" | "stale";
}

export function WardrobeFetchError({ onRetry, variant = "empty" }: WardrobeFetchErrorProps) {
  const message =
    variant === "stale"
      ? "Couldn't refresh your wardrobe. Showing saved items."
      : "Couldn't load your wardrobe.";

  return (
    <div className="wardrobe-error" role="alert">
      <div className="wardrobe-error-content">
        <AlertCircle size={16} className="shrink-0 text-red" aria-hidden />
        <p className="m-0 leading-snug">{message}</p>
      </div>
      <button type="button" onClick={onRetry} className="btn-secondary btn-sm shrink-0">
        Retry
      </button>
    </div>
  );
}
