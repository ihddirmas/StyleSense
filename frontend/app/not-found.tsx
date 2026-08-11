import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="surface w-full max-w-md p-10 text-center">
        <div className="font-display text-6xl mb-1" style={{ color: "var(--on-gold)" }}>404</div>
        <h1 className="font-display text-2xl mb-2">Page not found</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          This page doesn&apos;t exist or this feature isn&apos;t available yet.
        </p>
        <Link href="/" className="btn-primary inline-flex">Back to home</Link>
      </div>
    </div>
  );
}
