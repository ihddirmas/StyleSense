"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { LogOut, Loader2, Sparkles, Menu, X, Home, MessageCircle, Shirt, Layers, Bell, Users, Settings } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useTasks, selectRunningCount } from "@/store/tasks";

const PRIMARY_NAV = [
  { href: "/dashboard", label: "HOME" },
  { href: "/studio",    label: "STUDIO" },
  { href: "/stylist",   label: "ARIA" },
];

// Mobile drawer mirrors PRIMARY_NAV + the desktop Sidebar, since both are hidden on mobile.
const MOBILE_NAV = [
  { href: "/dashboard", label: "Home",     icon: Home },
  { href: "/studio",    label: "Studio",   icon: Sparkles },
  { href: "/stylist",   label: "Aria",     icon: MessageCircle },
  { href: "/wardrobe",  label: "Wardrobe", icon: Shirt },
  { href: "/outfits",   label: "Outfits",  icon: Layers },
  { href: "/activity",  label: "Activity", icon: Bell },
  { href: "/friends",   label: "Friends",  icon: Users },
  { href: "/settings",  label: "Settings", icon: Settings },
];

export function Topbar() {
  const { user, profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const runningCount = useTasks(selectRunningCount);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initial = (profile?.full_name?.[0] || user?.email?.[0] || "?").toUpperCase();

  function handleBrandClick() {
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
    }
  }

  return (
    <>
      <header
        className="flex items-center px-4 md:px-8 py-4 relative gap-4 md:gap-6 shrink-0"
        style={{ borderBottom: "2px solid #3C2415" }}
      >
        {/* LEFT — Brand (home) + tasks */}
        <div id="topbar-brand-group" className="flex items-center gap-2 md:gap-4 min-w-0 cursor-pointer" onClick={handleBrandClick}>
          <Link 
            href="/dashboard" 
            className="font-display tracking-tight cursor-pointer" 
            style={{ color: "var(--ink)", fontSize: "clamp(1.2rem, 4vw, 1.6rem)", textDecoration: "none" }}
          >
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

        {/* CENTER — Primary nav (Dashboard, Studio, Aria) */}
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

        {/* RIGHT — Mobile utility drawer + User dropdown */}
        <div className="ml-auto flex items-center gap-1 md:gap-2">
          {/* Mobile hamburger for utility drawer */}
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
                className="absolute right-0 top-full mt-2 surface p-2 min-w-[180px]"
                style={{ zIndex: 50 }}
              >
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

      {/* Mobile nav drawer — full tab set, since the center nav + sidebar are desktop-only */}
      {mobileMenuOpen && (
        <nav className="md:hidden shrink-0 border-b" style={{ background: "var(--bg)", borderColor: "rgba(60,36,21,0.2)" }}>
          <div className="px-2 py-2">
            {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm tracking-wide transition-colors"
                  style={{
                    textDecoration: "none",
                    fontWeight: active ? 700 : 400,
                    color: active ? "#3C2415" : "#84634c",
                    background: active ? "var(--parchment)" : "transparent",
                  }}
                >
                  <Icon size={16} />
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