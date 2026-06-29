"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function ScreenShot({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: "100%", height: 360, objectFit: "cover", objectPosition: "top left", display: "block" }}
    />
  );
}

// ── Browser chrome wrapper ─────────────────────────────────────────────────── //

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(60,36,21,0.15)", background: "var(--surface)", boxShadow: "0 32px 72px -12px rgba(60,36,21,0.28), 0 0 0 1px rgba(60,36,21,0.06)" }}>
      {/* Chrome bar */}
      <div style={{ height: 36, background: "#ede9d9", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 12px", gap: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 5 }}>
          {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
            <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.8 }} />
          ))}
        </div>
        <div style={{ flex: 1, background: "rgba(60,36,21,0.06)", borderRadius: 4, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>app.stylesense.ai</span>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────── //

const DEMOS = [
  {
    step: "01",
    title: "Upload your selfie",
    desc: "One photo is all it takes. StyleSense places you in every look, forever.",
    accent: "#8b6fe8",
    src: "/screenshots/dashboard.png",
    alt: "StyleSense dashboard showing your digital runway",
  },
  {
    step: "02",
    title: "Add any garment",
    desc: "Paste a URL from Amazon, ASOS, or any retailer. We extract and clean the garment automatically.",
    accent: "#5cb8b2",
    src: "/screenshots/wardrobe.png",
    alt: "StyleSense wardrobe with real clothing items",
  },
  {
    step: "03",
    title: "Try it on instantly",
    desc: "Photorealistic AI try-on in under 10 seconds. Compare before and after with the built-in slider.",
    accent: "#e87f8a",
    src: "/screenshots/studio.png",
    alt: "StyleSense studio try-on interface",
  },
  {
    step: "04",
    title: "Ask your AI stylist",
    desc: "Chat with Aria, your personal stylist who knows every piece in your closet. Get outfit advice for any occasion.",
    accent: "#c9a84c",
    src: "/screenshots/stylist.png",
    alt: "StyleSense Aria AI stylist chat",
  },
];

export default function ProductDemo() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const screenRefs = useRef<(HTMLDivElement | null)[]>([]);
  const progressLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        // Initial state
        screenRefs.current.forEach((el, i) => {
          if (el) gsap.set(el, { opacity: i === 0 ? 1 : 0, y: i === 0 ? 0 : 50 });
        });
        stepRefs.current.forEach((el, i) => {
          if (el) {
            gsap.set(el.querySelector(".step-title"), { color: i === 0 ? "var(--text)" : "var(--text-muted)" });
            gsap.set(el.querySelector(".step-desc"), { opacity: i === 0 ? 1 : 0 });
          }
        });

        const tl = gsap.timeline({
          scrollTrigger: {
            scroller: ".landing-scroll",
            trigger: wrapperRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 1.4,
          },
        });

        // Progress line grows across the 4 steps
        tl.to(progressLineRef.current, { scaleX: 1, ease: "none", duration: DEMOS.length - 1 }, 0);

        // Each step transition
        DEMOS.forEach((_, i) => {
          if (i === DEMOS.length - 1) return;

          const pos = i; // timeline position

          // Outgoing screen slides up + fades
          tl.to(screenRefs.current[i], { opacity: 0, y: -40, duration: 0.6 }, pos + 0.4);
          // Incoming screen slides up from bottom + fades in
          tl.fromTo(screenRefs.current[i + 1], { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.7 }, pos + 0.55);

          // Step label dimming
          tl.to(stepRefs.current[i]?.querySelector(".step-title") ?? null, { color: "var(--text-muted)", duration: 0.4 }, pos + 0.4);
          tl.to(stepRefs.current[i]?.querySelector(".step-desc") ?? null, { opacity: 0, duration: 0.3 }, pos + 0.35);
          // Next step lighting up
          tl.to(stepRefs.current[i + 1]?.querySelector(".step-title") ?? null, { color: "var(--text)", duration: 0.4 }, pos + 0.55);
          tl.to(stepRefs.current[i + 1]?.querySelector(".step-desc") ?? null, { opacity: 1, duration: 0.4 }, pos + 0.6);
        });
      });

      return () => ctx.revert();
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      screenRefs.current.forEach((el) => {
        if (el) gsap.set(el, { opacity: 1, y: 0 });
      });
    });

    return () => mm.revert();
  }, []);

  return (
    // Outer: provides the scroll distance (1 viewport per step)
    <div ref={wrapperRef} style={{ height: `${DEMOS.length * 100}vh`, background: "var(--surface)" }}>
      {/* Sticky panel */}
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0,
          overflow: "hidden",
        }}
      >
        {/* ── Left: step list ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 64px 0 48px",
            borderRight: "1px solid var(--border)",
            position: "relative",
          }}
        >
          {/* Section label */}
          <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", margin: "0 0 40px" }}>
            How it works
          </p>

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {DEMOS.map((demo, i) => (
              <div
                key={i}
                ref={(el) => { stepRefs.current[i] = el; }}
                style={{ padding: "24px 0", borderBottom: i < DEMOS.length - 1 ? "1px solid var(--border)" : "none", position: "relative" }}
              >
                {/* Accent dot on active */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em" }}>{demo.step}</span>
                  <span
                    className="step-title"
                    style={{
                      fontFamily: "Cormorant Garamond, serif",
                      fontSize: "clamp(18px, 2vw, 26px)",
                      fontWeight: 500,
                      color: i === 0 ? "var(--text)" : "var(--text-muted)",
                      transition: "color 0.1s",
                    }}
                  >
                    {demo.title}
                  </span>
                </div>
                {/* Wrapper gives every step consistent height regardless of whether desc is visible */}
                <div style={{ minHeight: 52, paddingLeft: 35 }}>
                  <p
                    className="step-desc"
                    style={{
                      fontSize: 14,
                      color: "var(--text-muted)",
                      margin: 0,
                      lineHeight: 1.65,
                      maxWidth: 340,
                    }}
                  >
                    {demo.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Progress line at bottom of step list */}
          <div style={{ marginTop: 32, height: 1, background: "var(--border)", position: "relative", overflow: "hidden" }}>
            <div
              ref={progressLineRef}
              style={{ position: "absolute", inset: 0, background: "var(--ink)", transformOrigin: "left center", transform: "scaleX(0)" }}
            />
          </div>
        </div>

        {/* ── Right: stacked screens ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 48px",
            background: "var(--bg)",
            position: "relative",
          }}
        >
          {DEMOS.map((demo, i) => (
            <div
              key={i}
              ref={(el) => { screenRefs.current[i] = el; }}
              style={{
                position: "absolute",
                inset: "32px 48px",
                opacity: i === 0 ? 1 : 0,
              }}
            >
              <BrowserFrame>
                <ScreenShot src={demo.src} alt={demo.alt} />
              </BrowserFrame>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
