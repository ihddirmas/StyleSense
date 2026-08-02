import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import HeroSection from "@/components/landing/HeroSection";
import MetricsRow from "@/components/landing/MetricsRow";
import ProductDemo from "@/components/landing/ProductDemo";
import HowItWorks from "@/components/landing/HowItWorks";
import FeaturesTab from "@/components/landing/FeaturesTab";
import ToolsGrid from "@/components/landing/ToolsGrid";
import FAQAccordion from "@/components/landing/FAQAccordion";
import LandingFooter from "@/components/landing/LandingFooter";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "StyleSense — AI Style Agent & Virtual Try-On",
  description:
    "Meet Aria, your AI style agent. She knows your wardrobe, recommends outfits, adds items from photos, looks up products, and generates try-ons — you confirm every action.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "StyleSense — AI Style Agent & Virtual Try-On",
    description:
      "Meet Aria — your AI style agent. Outfit picks, try-ons, and closet actions from a wardrobe she actually knows.",
    type: "website",
    siteName: "StyleSense",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "StyleSense — AI Style Agent & Virtual Try-On",
    description:
      "Meet Aria — your AI style agent. Outfit picks, try-ons, and closet actions from a wardrobe she actually knows.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "StyleSense",
  applicationCategory: "LifestyleApplication",
  description: "AI style agent, wardrobe, and virtual try-on.",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="landing-scroll">
        <LandingNav />
        <HeroSection />
        <MetricsRow />
        <div id="product-demo">
          <ProductDemo />
        </div>
        <HowItWorks />
        <FeaturesTab />
        <ToolsGrid />
        <FAQAccordion />
        <LandingFooter />
      </main>
    </>
  );
}
