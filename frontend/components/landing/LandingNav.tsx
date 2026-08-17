"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Menu, X } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const NAV_LINKS = [
  { id: "features",     label: "Features"      },
  { id: "how-it-works", label: "How it works" },
  { id: "faq",          label: "FAQ"           },
];

export default function LandingNav() {
  const navRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const scroller = document.querySelector(".landing-scroll");
    const target = document.getElementById(id);
    if (scroller && target) {
      const top = target.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top, behavior: "smooth" });
    }
    setMobileOpen(false);
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Backdrop blur on scroll
      ScrollTrigger.create({
        scroller: ".landing-scroll",
        start: "top-=60",
        onEnter: () => {
          gsap.to(navRef.current, {
            backdropFilter: "blur(16px)",
            backgroundColor: "rgba(221, 217, 206, 0.92)",
            borderBottomColor: "rgba(60, 36, 21, 0.12)",
            duration: 0.35,
          });
        },
        onLeaveBack: () => {
          gsap.to(navRef.current, {
            backdropFilter: "blur(0px)",
            backgroundColor: "rgba(221, 217, 206, 0)",
            borderBottomColor: "transparent",
            duration: 0.3,
          });
        },
      });

      // Scroll progress bar at the very top of the nav
      gsap.to(progressRef.current, {
        scaleX: 1,
        ease: "none",
        scrollTrigger: {
          scroller: ".landing-scroll",
          start: "top top",
          end: "bottom bottom",
          scrub: 0.3,
        },
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <nav
      aria-label="Primary"
      ref={navRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        borderBottom: mobileOpen ? "1px solid rgba(60, 36, 21, 0.12)" : "1px solid transparent",
        // Transparent-until-scroll is an intentional reveal effect (see the
        // ScrollTrigger below), but that leaves the bar see-through if the
        // mobile menu is opened before scrolling -- the dropdown panel then
        // sits on a transparent strip with hero content bleeding through
        // behind it. A menu overlay should never be see-through.
        backgroundColor: mobileOpen ? "rgba(221, 217, 206, 0.98)" : "rgba(221, 217, 206, 0)",
      }}
    >
      {/* Scroll progress bar */}
      <div
        ref={progressRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "var(--ink)",
          transformOrigin: "left center",
          transform: "scaleX(0)",
          zIndex: 1,
        }}
      />
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 32px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Wordmark */}
        <Link
          href="/"
          className="font-display"
          style={{ fontSize: 22, color: "var(--ink)", textDecoration: "none", letterSpacing: "0.02em" }}
        >
          StyleSenseAI
        </Link>

        {/* Center links */}
        <div className="landing-nav-center" style={{ display: "flex", gap: 40 }}>
          {NAV_LINKS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollToSection(id)}
              className="landing-nav-link bg-transparent border-0 cursor-pointer p-0 tracking-wide"
            >
              {label}
            </button>
          ))}
          <Link href="/pricing" className="landing-nav-link tracking-wide">
            Pricing
          </Link>
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/login" className="landing-nav-signin btn-secondary btn-sm tracking-wide">
            Sign in
          </Link>
          <Link href="/signup" className="landing-nav-cta btn-primary btn-sm tracking-wide">
            Get started
          </Link>

          {/* Mobile hamburger toggle — shown only under 860px via CSS */}
          <button
            className="landing-nav-toggle"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            style={{
              display: "none",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--ink)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div
          style={{
            background: "var(--bg)",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            padding: "16px 32px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {NAV_LINKS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              style={{
                fontSize: 16,
                color: "var(--text)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                padding: "12px 0",
                fontFamily: "Public Sans, sans-serif",
              }}
            >
              {label}
            </button>
          ))}
          <Link
            href="/pricing"
            onClick={() => setMobileOpen(false)}
            style={{
              fontSize: 16,
              color: "var(--text)",
              textDecoration: "none",
              padding: "12px 0",
              fontFamily: "Public Sans, sans-serif",
            }}
          >
            Pricing
          </Link>
          <Link
            href="/login"
            onClick={() => setMobileOpen(false)}
            style={{
              fontSize: 16,
              color: "var(--text)",
              textDecoration: "none",
              padding: "12px 0",
              fontFamily: "Public Sans, sans-serif",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            onClick={() => setMobileOpen(false)}
            className="landing-nav-cta-mobile btn-primary btn-sm tracking-wide"
            style={{ marginTop: 8, textAlign: "center" }}
          >
            Get started
          </Link>
        </div>
      )}
    </nav>
  );
}
