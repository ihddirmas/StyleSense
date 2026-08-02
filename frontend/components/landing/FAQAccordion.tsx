"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Plus } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const FAQS = [
  {
    q: "What is StyleSense?",
    a: "StyleSense is an AI wardrobe with a built-in style agent, Aria. She knows every item you own, recommends outfits from your real closet, and can add items, look up products, or generate try-ons — always with your confirmation before anything spends credits.",
  },
  {
    q: "What can Aria do?",
    a: "Aria picks outfits from your wardrobe, looks up products from URLs you paste, proposes adding items from photos you share, and generates try-on images on your avatar. Confirm-gated actions mean she never spends credits without your approval.",
  },
  {
    q: "How does the virtual try-on work?",
    a: "We use Runway's gen4 image model to composite your selfie with the garment image. The result is a photorealistic image of you wearing the item. The whole process takes under 10 seconds.",
  },
  {
    q: "Do I need my own Runway or Anthropic account?",
    a: "No. StyleSense handles all AI calls on the backend. You just need a StyleSense account — no external API keys required.",
  },
  {
    q: "How accurate is the try-on?",
    a: "Try-on accuracy depends on the selfie and the garment photo. Full-body selfies with a neutral background and flat-lay product images produce the best results. Occluded or complex photos may vary.",
  },
  {
    q: "Can I use StyleSense on mobile?",
    a: "Yes — the interface is mobile-responsive. For the best experience with the Studio canvas and video generation, a desktop browser is recommended.",
  },
  {
    q: "Is my data private?",
    a: "Your selfies and wardrobe items are stored in your private Supabase bucket and are never shared. Row-level security ensures only you can access your data.",
  },
];

export default function FAQAccordion() {
  const [open, setOpen] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const bodyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Section entrance animation
  useEffect(() => {
    const ctx = gsap.context(() => {
      const items = sectionRef.current?.querySelectorAll(".faq-item");
      if (items) {
        gsap.fromTo(
          items,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.08,
            ease: "power2.out",
            scrollTrigger: {
              scroller: ".landing-scroll",
              trigger: sectionRef.current,
              start: "top 80%",
            },
          }
        );
      }
    });
    return () => ctx.revert();
  }, []);

  const toggle = useCallback((i: number) => {
    const body = bodyRefs.current[i];
    const inner = innerRefs.current[i];
    if (!body || !inner) return;

    const isOpen = open === i;

    if (isOpen) {
      gsap.to(body, { height: 0, duration: 0.35, ease: "power2.inOut" });
      setOpen(null);
    } else {
      // Close previous
      if (open !== null) {
        const prevBody = bodyRefs.current[open];
        if (prevBody) gsap.to(prevBody, { height: 0, duration: 0.3, ease: "power2.inOut" });
      }
      // Open new
      const targetHeight = inner.offsetHeight;
      gsap.set(body, { height: 0 });
      gsap.to(body, { height: targetHeight, duration: 0.35, ease: "power2.inOut" });
      setOpen(i);
    }
  }, [open]);

  return (
    <section
      id="faq"
      ref={sectionRef}
      style={{ padding: "120px 32px", background: "var(--surface)" }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 64 }}>
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
            FAQ
          </p>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(32px, 4vw, 52px)", color: "var(--text)", margin: 0, fontWeight: 500 }}
          >
            Common questions
          </h2>
        </div>

        <div style={{ borderTop: "1px solid var(--border)" }}>
          {FAQS.map((faq, i) => (
            <div key={i} className="faq-item" style={{ borderBottom: "1px solid var(--border)" }}>
              <button
                onClick={() => toggle(i)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "28px 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  gap: 24,
                }}
              >
                <span
                  className="font-display"
                  style={{
                    fontSize: 20,
                    color: "var(--text)",
                    fontWeight: 500,
                  }}
                >
                  {faq.q}
                </span>
                <Plus
                  size={20}
                  color="var(--text-muted)"
                  style={{
                    flexShrink: 0,
                    transform: open === i ? "rotate(45deg)" : "rotate(0deg)",
                    transition: "transform 0.3s ease",
                  }}
                />
              </button>

              {/* GSAP-animated body */}
              <div
                ref={(el) => { bodyRefs.current[i] = el; }}
                style={{ height: 0, overflow: "hidden" }}
              >
                <div ref={(el) => { innerRefs.current[i] = el; }} style={{ paddingBottom: 28 }}>
                  <p style={{ fontSize: 16, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>
                    {faq.a}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
