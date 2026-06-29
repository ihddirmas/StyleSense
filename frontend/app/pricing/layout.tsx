import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — StyleSense",
  description:
    "Simple, transparent pricing for StyleSense. Start free with 5 AI try-ons per month. Upgrade to Studio or Pro for more.",
  robots: { index: true, follow: true },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
