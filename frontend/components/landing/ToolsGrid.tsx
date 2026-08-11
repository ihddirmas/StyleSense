"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Shirt, Globe, Video, MessageCircle, BookOpen, Heart } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const TOOLS = [
  { icon: MessageCircle, title: "Aria Style Agent",    description: "Chat, confirm actions, add items, try on looks", color: "#6b8e5f" },
  { icon: Shirt,         title: "Virtual Try-On",    description: "See yourself in any outfit in seconds",           color: "#8b6fe8" },
  { icon: Globe,         title: "Event Scenes",       description: "Drop yourself into any world — beach, runway, city", color: "#5cb8b2" },
  { icon: Video,         title: "Ramp Walk Video",    description: "Animate your look as a 5-second runway clip",    color: "#e87f8a" },
  { icon: BookOpen,      title: "Smart Wardrobe",     description: "Add from any URL. Organize everything.",          color: "#E7E2BC" },
  { icon: Heart,         title: "Outfit Builder",     description: "Save and share complete looks instantly",         color: "#e85c5c" },
];

export default function ToolsGrid() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        // Header: slide + fade with scrub
        gsap.fromTo(
          headerRef.current,
          { opacity: 0, y: 50 },
          {
            opacity: 1, y: 0,
            scrollTrigger: {
              scroller: ".landing-scroll",
              trigger: sectionRef.current,
              start: "top 80%",
              end: "top 50%",
              scrub: 0.8,
            },
          }
        );

        // Cards: staggered clip-path reveal (uncurtain from bottom)
        // Each card has its own trigger so they fire as they enter individually
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          const row = Math.floor(i / 3);
          const col = i % 3;

          gsap.fromTo(
            el,
            {
              opacity: 0,
              y: 60,
              scale: 0.93,
            },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.7,
              ease: "power3.out",
              scrollTrigger: {
                scroller: ".landing-scroll",
                trigger: el,
                start: "top 88%",
                end: "top 60%",
                scrub: 0.6,
              },
              delay: col * 0.05 + row * 0.1,
            }
          );
        });
      });

      return () => ctx.revert();
    });

    return () => mm.revert();
  }, []);

  return (
    <section ref={sectionRef} style={{ padding: "120px 32px", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div ref={headerRef} style={{ marginBottom: 64, maxWidth: 560 }}>
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              margin: "0 0 16px",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            What you get
          </p>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(32px, 4vw, 52px)", color: "var(--text)", margin: 0, fontWeight: 500 }}
          >
            Six tools, one agent-powered wardrobe
          </h2>
        </div>

        <div
          className="landing-grid-3col"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 0,
            borderTop: "1px solid var(--border)",
            borderLeft: "1px solid var(--border)",
          }}
        >
          {TOOLS.map((tool, i) => {
            const Icon = tool.icon;
            return (
              <div
                key={i}
                ref={(el) => { cardRefs.current[i] = el; }}
                className="tool-card"
                style={{
                  padding: "40px 36px",
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.25s",
                  cursor: "default",
                  opacity: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--surface)";
                  gsap.to(e.currentTarget.querySelector(".tool-icon"), {
                    scale: 1.12, rotation: -4, duration: 0.3, ease: "back.out(1.4)",
                  });
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  gsap.to(e.currentTarget.querySelector(".tool-icon"), {
                    scale: 1, rotation: 0, duration: 0.25, ease: "power2.out",
                  });
                }}
              >
                <div
                  className="tool-icon"
                  style={{
                    width: 44,
                    height: 44,
                    background: `${tool.color}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 20,
                  }}
                >
                  <Icon size={20} color={tool.color} strokeWidth={1.5} />
                </div>
                <h3
                  className="font-display"
                  style={{ fontSize: 20, color: "var(--text)", margin: "0 0 8px", fontWeight: 500 }}
                >
                  {tool.title}
                </h3>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                  {tool.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
