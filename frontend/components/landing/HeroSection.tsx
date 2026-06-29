"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function HeroAppMockup() {
  return (
    <img
      src="/screenshots/dashboard.png"
      alt="StyleSense dashboard"
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top left", display: "block" }}
    />
  );
}

// ── Hero component ─────────────────────────────────────────────────────────── //

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subtextRef = useRef<HTMLParagraphElement>(null);
  const ctasRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);

  const headline = "Wear it before you buy it";

  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        // ── Entrance sequence ──────────────────────────────────────────────── //
        // Headline words stagger up with 3D tilt
        const words = headlineRef.current?.querySelectorAll(".hero-word");
        if (words) {
          gsap.fromTo(words,
            { opacity: 0, y: 36, rotationX: 18, transformOrigin: "center bottom" },
            { opacity: 1, y: 0, rotationX: 0, duration: 0.85, stagger: 0.08, ease: "power3.out", delay: 0.2 }
          );
        }

        // Subtext + CTAs cascade in after headline
        gsap.fromTo([subtextRef.current, ctasRef.current],
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.65, stagger: 0.15, ease: "power2.out", delay: 0.9 }
        );

        // Browser frame rises from below with a 3D perspective tilt
        gsap.fromTo(frameRef.current,
          {
            opacity: 0,
            y: 140,
            rotationX: 18,
            transformPerspective: 1400,
            transformOrigin: "center top",
          },
          {
            opacity: 1,
            y: 0,
            rotationX: 0,
            duration: 1.45,
            delay: 1.05,
            ease: "power4.out",
          }
        );

        // ── Scroll parallax: frame drifts up slightly ─────────────────────── //
        gsap.to(frameRef.current, {
          y: -70,
          ease: "none",
          scrollTrigger: {
            scroller: ".landing-scroll",
            trigger: sectionRef.current,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
      });

      return () => ctx.revert();
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      // Just show everything
      gsap.set([headlineRef.current, subtextRef.current, ctasRef.current, frameRef.current], { opacity: 1, y: 0 });
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{
        minHeight: "100vh",
        paddingTop: 64,
        background: "var(--bg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* ── Centered copy block ── */}
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "80px 32px 60px",
          textAlign: "center",
          width: "100%",
        }}
      >

        <h1
          ref={headlineRef}
          className="font-display"
          style={{
            fontSize: "clamp(52px, 7.5vw, 100px)",
            lineHeight: 1.0,
            color: "var(--text)",
            margin: "0 0 32px",
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          {headline.split(" ").map((word, i) => (
            <span key={i} className="hero-word" style={{ display: "inline-block", marginRight: "0.22em", opacity: 0 }}>
              {word}
            </span>
          ))}
        </h1>

        <p
          ref={subtextRef}
          style={{
            fontSize: "clamp(16px, 1.5vw, 20px)",
            lineHeight: 1.7,
            color: "var(--text-muted)",
            margin: "0 auto 44px",
            maxWidth: 520,
            opacity: 0,
          }}
        >
          Upload a selfie. Add clothes from any URL. See yourself in them — in any scene, any world, in seconds.
        </p>

        <div
          ref={ctasRef}
          style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", opacity: 0 }}
        >
          <Link
            href="/signup"
            className="btn-primary"
            style={{ fontSize: 14, padding: "14px 36px", letterSpacing: "0.06em" }}
          >
            Get started free
          </Link>
          <button
            onClick={() => {
              const scroller = document.querySelector(".landing-scroll");
              const target = document.getElementById("product-demo");
              if (scroller && target) {
                const top = target.getBoundingClientRect().top + scroller.scrollTop;
                scroller.scrollTo({ top, behavior: "smooth" });
              }
            }}
            style={{
              fontSize: 14,
              padding: "14px 36px",
              color: "var(--text-muted)",
              background: "none",
              border: "1px solid var(--border)",
              letterSpacing: "0.06em",
              cursor: "pointer",
              fontFamily: "Public Sans, sans-serif",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text)";
              e.currentTarget.style.borderColor = "var(--border-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            See how it works ↓
          </button>
        </div>
      </div>

      {/* ── Browser frame mockup ── */}
      <div
        ref={frameWrapRef}
        style={{
          width: "100%",
          maxWidth: 1100,
          padding: "0 24px",
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
        }}
      >
        <div
          ref={frameRef}
          style={{
            width: "100%",
            borderRadius: "10px 10px 0 0",
            overflow: "hidden",
            border: "1px solid rgba(60,36,21,0.16)",
            borderBottom: "none",
            boxShadow:
              "0 -4px 0 0 rgba(60,36,21,0.04) inset, 0 40px 100px -20px rgba(60,36,21,0.22), 0 0 0 1px rgba(60,36,21,0.07)",
            opacity: 0,
          }}
        >
          {/* Browser chrome */}
          <div
            style={{
              height: 38,
              background: "#ede9d9",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: 5 }}>
              {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.85 }} />
              ))}
            </div>
            <div style={{ flex: 1, background: "rgba(60,36,21,0.06)", borderRadius: 4, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                app.stylesense.ai/wardrobe
              </span>
            </div>
            {/* Window action icons */}
            <div style={{ display: "flex", gap: 6 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: 2, background: "rgba(60,36,21,0.08)" }} />
              ))}
            </div>
          </div>

          {/* App content — fixed height so it partially bleeds below fold */}
          <div style={{ height: 380 }}>
            <HeroAppMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
