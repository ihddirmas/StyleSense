"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import posthog from "posthog-js";
import { useFeatureFlagVariantKey } from "posthog-js/react";
import { getPostHogPublicKey } from "@/lib/posthog-key";
import { useAuth } from "@/components/AuthProvider";

const tiers = [
  {
    name: "Free",
    price: null,
    priceLabel: "Free",
    description: "Discover your color season, Kibbe type, and grounded styling advice.",
    popular: false,
    features: [
      { label: "Color season + undertone analysis", included: true },
      { label: "Kibbe body type (with full-body photo)", included: true },
      { label: "Aria stylist — verdicts on URLs & wardrobe", included: true },
      { label: "20 wardrobe items", included: true },
      { label: "2 try-ons / month (proof)", included: true },
      { label: "Unlimited try-ons", included: false },
      { label: "Priority analysis refresh", included: false },
    ],
  },
  {
    name: "Studio",
    price: 9,
    priceLabel: "$9",
    description: "For shoppers who want try-on proof before they buy.",
    popular: true,
    features: [
      { label: "Everything in Free", included: true },
      { label: "40 try-ons / month", included: true },
      { label: "Unlimited wardrobe items", included: true },
      { label: "Priority profile refresh", included: true },
      { label: "Unlimited try-ons", included: false },
    ],
  },
  {
    name: "Pro",
    price: 19,
    priceLabel: "$19",
    description: "Heavy shoppers — unlimited try-on proof.",
    popular: false,
    features: [
      { label: "Everything in Studio", included: true },
      { label: "100 try-ons / month", included: true },
      { label: "Priority generation queue", included: true },
    ],
  },
] as const;

type TierName = (typeof tiers)[number]["name"];

const ctaCopy: Record<"control" | "benefit-framed", Record<TierName, string>> = {
  control: { Free: "Get started free", Studio: "Start Studio", Pro: "Go Pro" },
  "benefit-framed": { Free: "Try it free", Studio: "Start building outfits", Pro: "Unlock everything" },
};

export default function PricingPage() {
  const { user } = useAuth();
  const rawCtaVariant = useFeatureFlagVariantKey("pricing-cta-copy");
  const ctaVariant = rawCtaVariant === "benefit-framed" ? "benefit-framed" : "control";

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "Public Sans, sans-serif",
        padding: "80px 24px 64px",
      }}
    >
      {/* Back to landing — only needed when there's no app shell already providing one */}
      {!user && (
        <Link
          href="/"
          className="inline-flex items-center gap-1.5"
          style={{
            position: "fixed",
            top: 28,
            left: 28,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-muted)",
            textDecoration: "none",
            letterSpacing: "0.04em",
            zIndex: 3,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
        >
          <ArrowLeft size={14} />
          StyleSenseAI
        </Link>
      )}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 64 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "var(--text-dim)",
            textTransform: "uppercase",
            marginBottom: 16,
            fontFamily: "Public Sans, sans-serif",
          }}
        >
          PRICING
        </p>
        <h1
          className="font-display"
          style={{
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 400,
            color: "var(--ink)",
            margin: "0 0 16px",
            letterSpacing: "0.01em",
            lineHeight: 1.1,
          }}
        >
          Simple, transparent pricing.
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--text-muted)",
            margin: 0,
            letterSpacing: "0.01em",
          }}
        >
          Start free. Upgrade when your wardrobe does.
        </p>
      </div>

      {/* Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          maxWidth: 980,
          margin: "0 auto 40px",
          alignItems: "start",
        }}
      >
         {tiers.map((tier) => (
          <div
            key={tier.name}
            className="surface rounded-sm"
            style={{
              background: tier.popular ? "var(--surface2)" : "var(--surface)",
              border: tier.popular
                ? "1px solid var(--border-hover)"
                : "1px solid var(--border)",
              padding: "32px 28px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 0,
              position: "relative",
            }}
          >
            {/* Popular badge */}
            {tier.popular && (
              <div
                style={{
                  position: "absolute",
                  top: -1,
                  right: 24,
                  background: "var(--ink)",
                  color: "var(--parchment)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  fontFamily: "Public Sans, sans-serif",
                }}
              >
                Most popular
              </div>
            )}

            {/* Tier name */}
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                color: "var(--text-dim)",
                textTransform: "uppercase",
                margin: "0 0 12px",
                fontFamily: "Public Sans, sans-serif",
              }}
            >
              {tier.name}
            </p>

            {/* Price */}
            <div style={{ marginBottom: 8, display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                className="font-display"
                style={{ fontSize: 48, color: "var(--ink)", lineHeight: 1, fontWeight: 400 }}
              >
                {tier.priceLabel}
              </span>
              {tier.price !== null && (
                <span
                  style={{
                    fontSize: 14,
                    color: "var(--text-muted)",
                    fontFamily: "Public Sans, sans-serif",
                  }}
                >
                  / mo
                </span>
              )}
            </div>

            {/* Description */}
            <p
              style={{
                fontSize: 14,
                color: "var(--text-muted)",
                margin: "0 0 28px",
                lineHeight: 1.5,
                fontFamily: "Public Sans, sans-serif",
              }}
            >
              {tier.description}
            </p>

            {/* CTA */}
            <Link
              href="/signup"
              onClick={() => {
                if (getPostHogPublicKey()) posthog.capture("upgrade_cta_clicked", { tier: tier.name, variant: ctaVariant });
              }}
              className={tier.popular ? "btn-primary" : undefined}
              style={
                tier.popular
                  ? {
                      display: "block",
                      textAlign: "center",
                      fontSize: 13,
                      letterSpacing: "0.06em",
                      padding: "11px 20px",
                      textDecoration: "none",
                      marginBottom: 28,
                    }
                  : {
                      display: "block",
                      textAlign: "center",
                      fontSize: 13,
                      letterSpacing: "0.06em",
                      padding: "10px 20px",
                      textDecoration: "none",
                      color: "var(--ink)",
                      border: "1px solid var(--border-hover)",
                      borderRadius: "var(--radius-btn)",
                      fontFamily: "Public Sans, sans-serif",
                      transition: "background 0.2s, border-color 0.2s",
                      marginBottom: 28,
                    }
              }
              onMouseEnter={(e) => {
                if (tier.popular) return;
                e.currentTarget.style.background = "rgba(60, 36, 21, 0.05)";
                e.currentTarget.style.borderColor = "var(--ink)";
              }}
              onMouseLeave={(e) => {
                if (tier.popular) return;
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--border-hover)";
              }}
            >
              {ctaCopy[ctaVariant][tier.name]}
            </Link>

            {/* Divider */}
            <div
              style={{
                height: 1,
                background: "var(--border)",
                marginBottom: 24,
              }}
            />

            {/* Feature list */}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {tier.features.map((f) => (
                <li
                  key={f.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: f.included ? "var(--text)" : "var(--text-dim)",
                    fontFamily: "Public Sans, sans-serif",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 13,
                      color: f.included ? "var(--ink)" : "var(--text-dim)",
                      fontWeight: f.included ? 600 : 400,
                      width: 14,
                      display: "inline-block",
                    }}
                  >
                    {f.included ? "✓" : "—"}
                  </span>
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p
        style={{
          textAlign: "center",
          fontSize: 13,
          color: "var(--text-dim)",
          maxWidth: 560,
          margin: "0 auto",
          lineHeight: 1.6,
          fontFamily: "Public Sans, sans-serif",
        }}
      >
        All plans include AI try-on, wardrobe storage, and the Aria stylist. No credit card required for Free.
      </p>
    </main>
  );
}
