"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Copy, Check, Loader2, Sparkles, User, Menu, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "@/components/ui/Toast";
import { useTasks, selectRunningCount } from "@/store/tasks";

const PRIMARY_NAV = [
  { href: "/dashboard", label: "DASHBOARD" },
  { href: "/wardrobe",  label: "WARDROBE" },
  { href: "/studio",    label: "STUDIO" },
  { href: "/outfits",   label: "OUTFITS" },
  { href: "/stylist",   label: "ARIA" },
];

export function Topbar({ onBrandClick }: { onBrandClick?: () => void }) {
  const { user, profile, signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const runningCount = useTasks(selectRunningCount);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);


  function copyShareCode() {
    if (!profile?.share_code) return;
    navigator.clipboard.writeText(profile.share_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Share code copied!");
  }

  const initial = (profile?.full_name?.[0] || user?.email?.[0] || "?").toUpperCase();

  return (
    <>
      <header
        className="flex items-center px-4 md:px-8 py-4 relative gap-4 md:gap-6 shrink-0"
        style={{ borderBottom: "2px solid #3C2415" }}
      >
        {/* LEFT — Brand + tasks */}
        <div id="topbar-brand-group" className="flex items-center gap-2 md:gap-4 min-w-0 cursor-pointer" onClick={onBrandClick}>
          <Link href="/dashboard" className="font-display tracking-tight" style={{ color: "var(--ink)", fontSize: "clamp(1.2rem, 4vw, 1.6rem)", textDecoration: "none" }}>
            StyleSense
          </Link>
          {runningCount > 0 && (
            <Link
              href="/studio"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
              style={{
                background: "var(--gold-dim)",
                border: "1px solid var(--border-gold)",
                color: "var(--gold)",
                textDecoration: "none",
              }}
              title="Click to view in Studio"
            >
              <Loader2 size={12} className="spin" />
              <span>{runningCount} {runningCount === 1 ? "task" : "tasks"} running</span>
              <Sparkles size={11} />
            </Link>
          )}
        </div>

        {/* CENTER — Primary nav (hidden on mobile) */}
        <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1">
          {PRIMARY_NAV.map(({ href, label }) => {
            const active = href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={
                  active
                    ? "text-[#3C2415] font-bold px-4 py-2 text-sm transition-all tracking-wide"
                    : "text-[#84634c] font-normal px-4 py-2 text-sm transition-all tracking-wide hover:text-[#3C2415]"
                }
                style={{ textDecoration: "none" }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* RIGHT — Mobile menu + Friends, Chat, Avatar */}
        <div className="ml-auto flex items-center gap-1 md:gap-2">
          {/* Mobile hamburger menu button */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden w-10 h-10 flex items-center justify-center transition-colors"
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div ref={ref} className="relative ml-1 md:ml-2">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-3 cursor-pointer"
              style={{ background: "none", border: "none", color: "var(--text)" }}
            >
              <div
                className="rounded-full flex items-center justify-center font-semibold text-sm overflow-hidden flex-shrink-0"
                style={{
                  width: 36, height: 36,
                  background: profile?.avatar_selfie_url ? "transparent" : "var(--gold-dim)",
                  color: "var(--gold)",
                  border: "2px solid #3C2415",
                }}
              >
                {profile?.avatar_selfie_url ? (
                  <img
                    src={profile.avatar_selfie_url}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initial
                )}
              </div>
            </button>

            {open && (
              <div
                className="absolute right-0 top-full mt-2 surface p-2 min-w-[260px]"
                style={{ zIndex: 50 }}
              >
                {profile?.share_code && (
                  <button
                    onClick={copyShareCode}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-surface3 text-left"
                    style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", borderRadius: 8 }}
                  >
                    <div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>Your share code</div>
                      <div className="font-mono text-sm" style={{ color: "var(--gold)", letterSpacing: "0.1em" }}>
                        {profile.share_code}
                      </div>
                    </div>
                    {copied ? <Check size={14} color="var(--green)" /> : <Copy size={14} />}
                  </button>
                )}
                <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm"
                  style={{ color: "var(--text)", textDecoration: "none", borderRadius: 8 }}
                >
                  <User size={14} /> Settings
                </Link>
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm"
                  style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", borderRadius: 8 }}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile nav menu */}
      {mobileMenuOpen && (
        <nav className="md:hidden shrink-0 border-b" style={{ background: "var(--bg)", borderColor: "rgba(60,36,21,0.2)" }}>
          <div className="px-2 py-2">
            {[
              ...PRIMARY_NAV,
              { href: "/activity", label: "ACTIVITY" },
              { href: "/friends",  label: "FRIENDS" },
              { href: "/chat",     label: "CHAT" },
              { href: "/settings", label: "SETTINGS" },
            ].map(({ href, label }) => {
              const active = href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm tracking-wide transition-colors"
                  style={{
                    textDecoration: "none",
                    fontWeight: active ? 700 : 400,
                    color: active ? "#3C2415" : "#84634c",
                    background: active ? "var(--parchment)" : "transparent",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
