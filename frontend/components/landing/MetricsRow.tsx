"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const METRICS = [
  { value: 10, suffix: "s", label: "avg. try-on generation time" },
  { value: 5,  suffix: "s", label: "ramp-walk video length"      },
  { value: 1,  suffix: "",  label: "selfie → infinite looks"     },
];

export default function MetricsRow() {
  const sectionRef = useRef<HTMLElement>(null);
  const counterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        // Clip-path reveal: cards uncurtain from the bottom
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          // stagger the start position per card so they reveal sequentially
          const startOffset = i * 8; // percentage points offset
          gsap.fromTo(
            el,
            { clipPath: "inset(100% 0 0 0)", opacity: 1 },
            {
              clipPath: "inset(0% 0 0 0)",
              ease: "power3.out",
              scrollTrigger: {
                scroller: ".landing-scroll",
                trigger: sectionRef.current,
                start: `top ${75 - startOffset}%`,
                end: `top ${42 - startOffset}%`,
                scrub: 0.8,
              },
            }
          );
        });

        // Scrub-linked counters — numbers tick up as you scroll through the section
        METRICS.forEach((metric, i) => {
          const el = counterRefs.current[i];
          if (!el) return;
          const obj = { val: 0 };
          gsap.to(obj, {
            val: metric.value,
            ease: "none",
            scrollTrigger: {
              scroller: ".landing-scroll",
              trigger: sectionRef.current,
              start: "top 65%",
              end: "top 20%",
              scrub: 0.6,
            },
            onUpdate() {
              el.textContent = Math.round(obj.val).toString();
            },
          });
        });

        // Divider lines grow in from left
        const lines = sectionRef.current?.querySelectorAll(".metric-divider");
        if (lines) {
          gsap.fromTo(
            lines,
            { scaleX: 0, transformOrigin: "left center" },
            {
              scaleX: 1,
              duration: 1,
              stagger: 0.15,
              ease: "power2.out",
              scrollTrigger: {
                scroller: ".landing-scroll",
                trigger: sectionRef.current,
                start: "top 70%",
                end: "top 45%",
                scrub: 0.8,
              },
            }
          );
        }
      });

      return () => ctx.revert();
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      counterRefs.current.forEach((el, i) => {
        if (el) el.textContent = METRICS[i].value.toString();
      });
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        padding: "80px 32px",
        overflow: "hidden",
      }}
    >
      <div
        className="landing-grid-3col"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
        }}
      >
        {METRICS.map((metric, i) => (
          <div
            key={i}
            ref={(el) => { cardRefs.current[i] = el; }}
            className="metric-card"
            style={{
              padding: "40px 48px",
              borderRight: i < METRICS.length - 1 ? "1px solid var(--border)" : "none",
              textAlign: "center",
            }}
          >
            <div
              className="font-display"
              style={{
                fontSize: "clamp(56px, 8vw, 96px)",
                lineHeight: 1,
                color: "var(--ink)",
                marginBottom: 16,
                fontWeight: 500,
              }}
            >
              <span ref={(el) => { counterRefs.current[i] = el; }}>0</span>
              {metric.suffix}
            </div>

            {/* Animated underline */}
            <div
              className="metric-divider"
              style={{
                height: 1,
                background: "var(--border-hover)",
                marginBottom: 16,
              }}
            />

            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                margin: 0,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              {metric.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
