"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function LandingNav() {
  const navRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

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
      ref={navRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        borderBottom: "1px solid transparent",
        backgroundColor: "rgba(221, 217, 206, 0)",
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
          StyleSense
        </Link>

        {/* Center links */}
        <div style={{ display: "flex", gap: 40 }}>
          {[
            { id: "features",    label: "Features"      },
            { id: "how-it-works", label: "How it works" },
            { id: "faq",         label: "FAQ"           },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                const scroller = document.querySelector(".landing-scroll");
                const target = document.getElementById(id);
                if (scroller && target) {
                  const top = target.getBoundingClientRect().top + scroller.scrollTop;
                  scroller.scrollTo({ top, behavior: "smooth" });
                }
              }}
              style={{
                fontSize: 14,
                color: "var(--text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.04em",
                fontFamily: "Public Sans, sans-serif",
                transition: "color 0.2s",
                padding: 0,
              }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--text)")}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "var(--text-muted)")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/login"
            style={{
              fontSize: 14,
              color: "var(--ink)",
              textDecoration: "none",
              padding: "8px 20px",
              border: "1px solid var(--border-hover)",
              letterSpacing: "0.04em",
              transition: "all 0.2s",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="btn-primary"
            style={{ fontSize: 14, padding: "8px 20px", letterSpacing: "0.04em" }}
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
