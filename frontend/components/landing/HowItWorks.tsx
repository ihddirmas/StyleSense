"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    number: "01",
    title: "Upload a selfie",
    description:
      "Take or upload a photo of yourself. StyleSense uses it to place you in every try-on and scene — once and forever.",
    accent: "#8b6fe8",
  },
  {
    number: "02",
    title: "Add clothes from any URL",
    description:
      "Paste a link from Amazon, ASOS, or any retailer. We extract the garment image automatically and clean the background.",
    accent: "#5cb8b2",
  },
  {
    number: "03",
    title: "See yourself wearing it",
    description:
      "Generate a photorealistic try-on in seconds — or drop yourself into any scene, from a beach wedding to a Parisian runway.",
    accent: "#e87f8a",
  },
  {
    number: "04",
    title: "Animate as a 5-second video",
    description:
      "Turn your try-on into a ramp-walk video clip powered by Runway AI. Download and share directly from the Studio.",
    accent: "#c9a84c",
  },
];

export default function HowItWorks() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const numRefs = useRef<(HTMLDivElement | null)[]>([]);
  const progressRef = useRef<HTMLDivElement>(null);
  const counterLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference) and (min-width: 861px)", () => {
      const ctx = gsap.context(() => {
        // ── Build a scrub timeline across the entire wrapper scroll distance ──
        const tl = gsap.timeline({
          scrollTrigger: {
            scroller: ".landing-scroll",
            trigger: wrapperRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 1.2,
          },
        });

        // Initial state: first panel fully visible, rest invisible
        panelRefs.current.forEach((el, i) => {
          if (!el) return;
          gsap.set(el, { opacity: i === 0 ? 1 : 0, y: i === 0 ? 0 : 60 });
        });

        // For each step transition, allocate 1 unit of timeline length
        const total = STEPS.length - 1;
        STEPS.forEach((_, i) => {
          if (i === total) return; // last step just stays

          // fade out current step
          tl.to(panelRefs.current[i], { opacity: 0, y: -50, duration: 1 }, i);
          // fade in next step
          tl.fromTo(
            panelRefs.current[i + 1],
            { opacity: 0, y: 60 },
            { opacity: 1, y: 0, duration: 1 },
            i + 0.4 // slight overlap so there's no blank frame
          );
          // progress bar
          tl.to(progressRef.current, { scaleX: (i + 1) / total, duration: 1 }, i);

          // step counter label
          tl.call(() => {
            if (counterLabelRef.current)
              counterLabelRef.current.textContent = `0${i + 2}`;
          }, [], i + 0.5);
        });

        // Animate each big number independently (slight scale pulse on enter)
        numRefs.current.forEach((el, i) => {
          if (!el) return;
          gsap.fromTo(
            el,
            { scale: 0.85, opacity: 0 },
            {
              scale: 1,
              opacity: 1,
              duration: 0.6,
              ease: "back.out(1.4)",
              scrollTrigger: {
                scroller: ".landing-scroll",
                trigger: panelRefs.current[i],
                containerAnimation: tl,
                start: "left 80%",
                toggleActions: "play none none reverse",
              },
            }
          );
        });
      });

      return () => ctx.revert();
    });

    // reduced-motion fallback + mobile: skip pinned scrub, just show all steps stacked
    mm.add("(prefers-reduced-motion: reduce), (max-width: 860px)", () => {
      const ctx = gsap.context(() => {
        panelRefs.current.forEach((el) => {
          if (!el) return;
          gsap.set(el, { opacity: 1, y: 0 });
        });
      });
      return () => ctx.revert();
    });

    return () => mm.revert();
  }, []);

  return (
    <div
      id="how-it-works"
      ref={wrapperRef}
      className="how-it-works-wrapper"
      style={{ height: `${STEPS.length * 100}vh` }}
    >
      {/* Sticky viewport — stays in view while wrapper scrolls past */}
      <div
        ref={stickyRef}
        className="how-it-works-sticky"
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 32px",
        }}
      >
        {/* Header row */}
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            width: "100%",
            marginBottom: 48,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <p
              style={{
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                margin: 0,
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              How it works
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <span
                ref={counterLabelRef}
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                01
              </span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--border-hover)" }}>
                / 04
              </span>
            </div>
          </div>

          {/* Progress track */}
          <div
            style={{
              marginTop: 12,
              height: 1,
              background: "var(--border)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              ref={progressRef}
              style={{
                position: "absolute",
                inset: 0,
                background: "var(--ink)",
                transformOrigin: "left center",
                transform: "scaleX(0)",
              }}
            />
          </div>
        </div>

        {/* Step panels — each absolutely stacked, GSAP controls which is visible */}
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            width: "100%",
            position: "relative",
            flex: 1,
          }}
        >
          {STEPS.map((step, i) => (
            <div
              key={i}
              ref={(el) => { panelRefs.current[i] = el; }}
              className="how-it-works-panel"
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 80,
                alignItems: "center",
              }}
            >
              {/* Left: number + title + description */}
              <div>
                <div
                  ref={(el) => { numRefs.current[i] = el; }}
                  className="font-display"
                  style={{
                    fontSize: "clamp(80px, 12vw, 140px)",
                    lineHeight: 1,
                    color: step.accent,
                    opacity: 0.18,
                    marginBottom: 24,
                    fontWeight: 300,
                    userSelect: "none",
                  }}
                >
                  {step.number}
                </div>
                <h2
                  className="font-display"
                  style={{
                    fontSize: "clamp(28px, 4vw, 52px)",
                    color: "var(--text)",
                    margin: "0 0 20px",
                    fontWeight: 500,
                    lineHeight: 1.1,
                  }}
                >
                  {step.title}
                </h2>
                <p
                  style={{
                    fontSize: 18,
                    color: "var(--text-muted)",
                    margin: 0,
                    lineHeight: 1.7,
                    maxWidth: 420,
                  }}
                >
                  {step.description}
                </p>
              </div>

              {/* Right: visual placeholder */}
              <div
                style={{
                  aspectRatio: "4/3",
                  background: `${step.accent}12`,
                  border: `1px solid ${step.accent}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: `${step.accent}25`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    className="font-display"
                    style={{ fontSize: 20, color: step.accent, fontWeight: 500 }}
                  >
                    {step.number}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    color: step.accent,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    opacity: 0.7,
                  }}
                >
                  Step {step.number}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
