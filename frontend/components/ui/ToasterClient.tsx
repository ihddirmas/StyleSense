"use client";
import dynamic from "next/dynamic";
import { useToastStore } from "@/store/toast";

// Toaster is the only framer-motion importer on the public landing critical
// path. It renders nothing until a toast exists, so we mount it (and load the
// framer-motion chunk) only when the first toast fires — keeping framer-motion
// (~1s of throttled-CPU script evaluation) entirely off pages that never show
// a toast, including the landing page. Toasts pushed before the chunk loads
// are held in the store and render once mounted.
const Toaster = dynamic(() => import("@/components/ui/Toast").then((m) => m.Toaster), {
  ssr: false,
});

export default function ToasterClient() {
  const hasToasts = useToastStore((s) => s.toasts.length > 0);
  if (!hasToasts) return null;
  return <Toaster />;
}
