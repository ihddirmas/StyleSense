"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Toaster } from "@/components/ui/Toast";
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ position: "relative", zIndex: 1 }}>
      <FashionBackground />
      <Toaster />
      <AuthCard initialMode="signup" next={next} />
    </div>
  );
}
