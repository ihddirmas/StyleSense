import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "var(--surface2)" }}
    >
      <LoaderCircle size={28} className="spin" aria-hidden="true" style={{ color: "var(--on-gold)" }} />
    </div>
  );
}
