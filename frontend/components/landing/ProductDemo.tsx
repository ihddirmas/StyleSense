"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// ── Inline app-UI mockups (no real screenshots needed) ────────────────────── //

function TopbarMock({ active }: { active: string }) {
  const nav = ["DASHBOARD", "WARDROBE", "STUDIO", "OUTFITS", "ARIA"];
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0 20px", height: 44, borderBottom: "1px solid var(--border)", gap: 24, background: "#f7f1ea", flexShrink: 0 }}>
      <span style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 14, color: "var(--ink)", fontWeight: 600, letterSpacing: "0.02em" }}>StyleSense</span>
      <div style={{ display: "flex", gap: 16, marginLeft: 8 }}>
        {nav.map((n) => (
          <span key={n} style={{ fontSize: 10, letterSpacing: "0.06em", color: n === active ? "var(--ink)" : "var(--text-muted)", fontWeight: n === active ? 700 : 400, fontFamily: "Public Sans, sans-serif" }}>{n}</span>
        ))}
      </div>
    </div>
  );
}

function OnboardingMock() {
  return (
    <div style={{ height: 360, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)", gap: 16, padding: 32 }}>
      <div style={{ width: 96, height: 96, borderRadius: "50%", border: "2px dashed var(--border-hover)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", fontFamily: "Public Sans, sans-serif", marginBottom: 4 }}>Upload your selfie</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "Public Sans, sans-serif" }}>One photo unlocks every try-on</div>
      </div>
      <div style={{ background: "var(--ink)", color: "#f7f1ea", fontSize: 11, padding: "8px 20px", fontFamily: "Public Sans, sans-serif", letterSpacing: "0.06em", cursor: "pointer" }}>
        CHOOSE PHOTO
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
        {["natural light", "neutral bg", "full body"].map((tip) => (
          <div key={tip} style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>✓ {tip}</div>
        ))}
      </div>
    </div>
  );
}

function WardrobeMock() {
  const items = [
    { color: "#8b6fe8", label: "Silk Blouse",    cat: "tops"      },
    { color: "#c9a84c", label: "Linen Blazer",   cat: "outerwear" },
    { color: "#3C2415", label: "Trench Coat",    cat: "outerwear" },
    { color: "#5cb8b2", label: "Midi Dress",     cat: "dresses"   },
    { color: "#e87f8a", label: "Pleated Skirt",  cat: "bottoms"   },
    { color: "#6b8e5f", label: "Wide-leg Pants", cat: "bottoms"   },
  ];
  return (
    <div style={{ height: 360, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* URL bar */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center", background: "var(--surface)", flexShrink: 0 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <div style={{ flex: 1, background: "#f4f2df", fontSize: 10, color: "var(--text-muted)", padding: "3px 10px", fontFamily: "JetBrains Mono, monospace", borderRadius: 3 }}>
          paste amazon / asos / any retailer URL…
        </div>
        <div style={{ background: "var(--ink)", color: "#f7f1ea", fontSize: 10, padding: "3px 10px", fontFamily: "Public Sans, sans-serif", borderRadius: 2, cursor: "pointer" }}>ADD</div>
      </div>
      {/* Grid */}
      <div style={{ flex: 1, padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, overflow: "hidden" }}>
        {items.map((item) => (
          <div key={item.label} style={{ background: `${item.color}14`, border: `1px solid ${item.color}30`, padding: "10px 8px 8px", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer" }}>
            <div style={{ width: "100%", aspectRatio: "3/4", background: `${item.color}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 28, height: 42, background: item.color, opacity: 0.55, borderRadius: 1 }} />
            </div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "Public Sans, sans-serif", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{item.label}</div>
            <div style={{ fontSize: 8, color: item.color, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.cat}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudioMock() {
  return (
    <div style={{ height: 360, display: "flex", background: "var(--bg)" }}>
      {/* Left — item list */}
      <div style={{ width: 100, borderRight: "1px solid var(--border)", padding: "12px 8px", display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)", flexShrink: 0 }}>
        <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Selected</div>
        {[{ color: "#8b6fe8", label: "Silk Blouse" }, { color: "#5cb8b2", label: "Midi Dress" }].map((it) => (
          <div key={it.label} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 28, height: 36, background: `${it.color}25`, border: `1px solid ${it.color}50`, flexShrink: 0 }} />
            <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "Public Sans, sans-serif", lineHeight: 1.3 }}>{it.label}</div>
          </div>
        ))}
        <div style={{ marginTop: "auto" }}>
          <div style={{ background: "var(--ink)", color: "#f7f1ea", fontSize: 9, padding: "6px 8px", textAlign: "center", fontFamily: "Public Sans, sans-serif", letterSpacing: "0.06em", cursor: "pointer" }}>TRY ON ✦</div>
        </div>
      </div>

      {/* Right — canvas / result */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, position: "relative" }}>
        {/* compare slider mock */}
        <div style={{ width: "75%", aspectRatio: "3/4", position: "relative", overflow: "hidden", border: "1px solid var(--border)" }}>
          {/* "before" — flat garment */}
          <div style={{ position: "absolute", left: 0, top: 0, width: "50%", height: "100%", background: "#8b6fe814", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "2px solid var(--ink)" }}>
            <div style={{ width: 32, height: 52, background: "#8b6fe860", borderRadius: 2 }} />
          </div>
          {/* "after" — person wearing */}
          <div style={{ position: "absolute", right: 0, top: 0, width: "50%", height: "100%", background: "#5cb8b210", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 20, height: 52, background: "#3C241540", borderRadius: 1 }}>
              <div style={{ width: "100%", height: 26, background: "#8b6fe880", borderRadius: "1px 1px 0 0" }} />
            </div>
          </div>
          {/* slider handle */}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 22, height: 22, borderRadius: "50%", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "ew-resize", zIndex: 2 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f7f1ea" strokeWidth="2.5"><path d="M21 12H3M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/></svg>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "Public Sans, sans-serif" }}>← Before</div>
          <div style={{ fontSize: 9, color: "var(--ink)", fontFamily: "Public Sans, sans-serif", fontWeight: 600 }}>After →</div>
        </div>
      </div>
    </div>
  );
}

function AnimateMock() {
  return (
    <div style={{ height: 360, display: "flex", gap: 0, background: "var(--bg)" }}>
      {/* Saved outfit card */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
        <div style={{ width: "100%", maxWidth: 180, border: "1px solid var(--border)", background: "var(--surface)" }}>
          {/* Video thumbnail */}
          <div style={{ width: "100%", aspectRatio: "9/16", background: "linear-gradient(160deg,#8b6fe830,#5cb8b220)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Silhouette */}
            <div style={{ width: 30, height: 70, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#3C241540" }} />
              <div style={{ width: 22, height: 32, background: "#8b6fe860", borderRadius: "2px 2px 0 0" }} />
              <div style={{ width: 18, height: 20, background: "#3C241525", display: "flex", gap: 2 }}>
                <div style={{ flex: 1, background: "#5cb8b240" }} />
                <div style={{ flex: 1, background: "#5cb8b240" }} />
              </div>
            </div>
            {/* Play button */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(60,36,21,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#f7f1ea"><polygon points="5,3 19,12 5,21"/></svg>
              </div>
            </div>
            {/* Duration tag */}
            <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(60,36,21,0.7)", color: "#f7f1ea", fontSize: 9, padding: "2px 5px", fontFamily: "JetBrains Mono, monospace" }}>5s</div>
          </div>
          <div style={{ padding: "8px 10px", borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--text)", fontFamily: "Public Sans, sans-serif", fontWeight: 600 }}>Summer Editorial</div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "Public Sans, sans-serif", marginTop: 2 }}>Silk Blouse · Midi Dress</div>
          </div>
        </div>
        {/* Share row */}
        <div style={{ display: "flex", gap: 8 }}>
          {["↗ Share", "⬇ Download"].map((label) => (
            <div key={label} style={{ fontSize: 9, padding: "5px 10px", border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "Public Sans, sans-serif", cursor: "pointer" }}>{label}</div>
          ))}
        </div>
      </div>
    </div>
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
      {/* App topbar */}
      <TopbarMock active="" />
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
    Screen: OnboardingMock,
  },
  {
    step: "02",
    title: "Add any garment",
    desc: "Paste a URL from Amazon, ASOS, or any retailer. We extract and clean the garment automatically.",
    accent: "#5cb8b2",
    Screen: WardrobeMock,
  },
  {
    step: "03",
    title: "Try it on instantly",
    desc: "Photorealistic AI try-on in under 10 seconds. Compare before and after with the built-in slider.",
    accent: "#e87f8a",
    Screen: StudioMock,
  },
  {
    step: "04",
    title: "Animate & share",
    desc: "Turn any look into a 5-second ramp-walk video. Download or share directly from StyleSense.",
    accent: "#c9a84c",
    Screen: AnimateMock,
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
          {DEMOS.map((demo, i) => {
            const Screen = demo.Screen;
            return (
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
                  <Screen />
                </BrowserFrame>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
