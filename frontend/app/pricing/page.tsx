import Link from "next/link";

const tiers = [
  {
    name: "Free",
    price: null,
    priceLabel: "Free",
    description: "Everything you need to start exploring your style.",
    cta: "Get started free",
    popular: false,
    features: [
      { label: "5 try-ons / month",         included: true  },
      { label: "20 wardrobe items",          included: true  },
      { label: "AI Stylist (text)",          included: true  },
      { label: "This-or-That",              included: true  },
      { label: "Friends & sharing",          included: true  },
      { label: "Event scene placement",      included: false },
      { label: "Video animation",            included: false },
      { label: "Priority generation",        included: false },
    ],
  },
  {
    name: "Studio",
    price: 9,
    priceLabel: "$9",
    description: "For the outfit-planner who wants room to experiment.",
    cta: "Start Studio",
    popular: true,
    features: [
      { label: "40 try-ons / month",         included: true  },
      { label: "Unlimited wardrobe items",   included: true  },
      { label: "AI Stylist (text)",          included: true  },
      { label: "This-or-That",              included: true  },
      { label: "Friends & sharing",          included: true  },
      { label: "Event scene placement",      included: true  },
      { label: "Video animation",            included: false },
      { label: "Priority generation",        included: false },
    ],
  },
  {
    name: "Pro",
    price: 19,
    priceLabel: "$19",
    description: "Full creative power — animate, prioritise, and share freely.",
    cta: "Go Pro",
    popular: false,
    features: [
      { label: "100 try-ons / month",        included: true  },
      { label: "Unlimited wardrobe items",   included: true  },
      { label: "AI Stylist (text)",          included: true  },
      { label: "This-or-That",              included: true  },
      { label: "Friends & sharing",          included: true  },
      { label: "Event scene placement",      included: true  },
      { label: "Video animation",            included: true  },
      { label: "Priority generation",        included: true  },
    ],
  },
] as const;

export default function PricingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "Public Sans, sans-serif",
        padding: "80px 24px 64px",
      }}
    >
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
            className="surface"
            style={{
              background: tier.popular ? "var(--surface2)" : "var(--surface)",
              border: tier.popular
                ? "1px solid var(--border-hover)"
                : "1px solid var(--border)",
              borderRadius: 4,
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
                      transition: "border-color 0.2s",
                      marginBottom: 28,
                    }
              }
            >
              {tier.cta}
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
