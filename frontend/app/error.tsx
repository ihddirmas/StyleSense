"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console for debugging; users see the friendly card below.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="surface w-full max-w-md p-10 text-center">
        <div className="font-display text-5xl mb-1" style={{ color: "var(--on-gold)" }}>Oops</div>
        <h1 className="font-display text-2xl mb-2">Something went wrong</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          This feature ran into a problem. You can try again or head back home.
        </p>
        <div className="flex gap-2 justify-center">
          <button className="btn-primary" onClick={reset}>Try again</button>
          <Link href="/" className="btn-secondary">Home</Link>
        </div>
      </div>
    </div>
  );
}
