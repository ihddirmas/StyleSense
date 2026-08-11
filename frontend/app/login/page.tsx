"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FashionBackground } from "@/components/ui/FashionBackground";
import { AuthCard } from "@/components/ui/AuthCard";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";

  return (
    <div className="h-screen overflow-y-auto relative z-10">
      <FashionBackground />
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium tracking-wide fixed top-7 left-7 z-10 no-underline transition-colors"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        <ArrowLeft size={14} />
        StyleSenseAI
      </Link>
      <div className="min-h-full flex items-center justify-center px-4 py-16">
        <AuthCard initialMode="login" next={next} />
      </div>
    </div>
  );
}
