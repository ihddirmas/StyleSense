"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FashionBackground } from "@/components/ui/FashionBackground";
import { AuthCard } from "@/components/ui/AuthCard";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";

  return (
    <div className="h-screen overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
      <FashionBackground />
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium tracking-wide"
        style={{
          position: "fixed",
          top: 28,
          left: 28,
          color: "var(--text-muted)",
          textDecoration: "none",
          zIndex: 3,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        <ArrowLeft size={14} />
        StyleSense
      </Link>
      <div className="min-h-full flex items-center justify-center px-4 py-16">
        <AuthCard initialMode="signup" next={next} />
      </div>
    </div>
  );
}
