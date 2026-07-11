"use client";

import Link from "next/link";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Wardrobe", href: "/wardrobe" },
      { label: "Studio", href: "/studio" },
      { label: "Outfits", href: "/outfits" },
      { label: "AI Stylist", href: "/stylist" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Sign up", href: "/signup" },
      { label: "Sign in", href: "/login" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
    ],
  },
];

export default function LandingFooter() {
  return (
    <footer
      style={{
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
        padding: "80px 32px 48px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          className="landing-footer-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: 64,
            marginBottom: 64,
          }}
        >
          {/* Brand */}
          <div>
            <div
              className="font-display"
              style={{ fontSize: 24, color: "var(--ink)", marginBottom: 16 }}
            >
              StyleSense
            </div>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, lineHeight: 1.7, maxWidth: 260 }}>
              AI-powered wardrobe and virtual try-on. Wear it before you buy it.
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p
                style={{
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-dim)",
                  margin: "0 0 20px",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {col.heading}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      style={{
                        fontSize: 14,
                        color: "var(--text-muted)",
                        textDecoration: "none",
                        transition: "color 0.2s",
                      }}
                      onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "var(--text)")}
                      onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "var(--text-muted)")}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="landing-footer-bottom"
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 32,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>
            © {new Date().getFullYear()} StyleSense. All rights reserved.
          </p>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0, fontFamily: "JetBrains Mono, monospace" }}>
            Powered by Runway · Anthropic · Supabase
          </p>
        </div>
      </div>
    </footer>
  );
}
