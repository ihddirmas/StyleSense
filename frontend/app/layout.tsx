import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LayoutClient } from "@/components/layout/LayoutClient";
import ToasterClient from "@/components/ui/ToasterClient";
import { AuthProvider } from "@/components/AuthProvider";
import { PostHogProvider } from "@/components/PostHogProvider";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { PRODUCTION_SITE_URL } from "@/lib/api-base";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.NODE_ENV === "production" ? PRODUCTION_SITE_URL : "http://localhost:3000")
  ),
  title: {
    default: "StyleSenseAI — AI Style Agent & Virtual Try-On",
    template: "%s · StyleSenseAI",
  },
  description:
    "StyleSenseAI is your AI style agent and virtual try-on studio. Aria knows your wardrobe, recommends outfits, and runs confirm-gated actions — add items, try on looks, look up products.",
  keywords: [
    "AI wardrobe",
    "virtual try-on",
    "AI style agent",
    "outfit generator",
    "fashion AI",
    "StyleSenseAI",
  ],
  applicationName: "StyleSenseAI",
  openGraph: {
    title: "StyleSenseAI — AI Wardrobe & Virtual Try-On",
    description:
      "Meet Aria — your AI style agent. Outfit picks, try-ons, and closet actions from a wardrobe she actually knows.",
    type: "website",
    siteName: "StyleSenseAI",
  },
  twitter: {
    card: "summary_large_image",
    title: "StyleSenseAI — AI Wardrobe & Virtual Try-On",
    description:
      "Meet Aria — your AI style agent. Outfit picks, try-ons, and closet actions from a wardrobe she actually knows.",
  },
};

export const viewport: Viewport = {
  themeColor: "#3C2415",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://us.i.posthog.com" />
        <link rel="preconnect" href="https://us-assets.i.posthog.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Public+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <PostHogProvider>
          <AuthProvider initialUser={user} initialProfile={profile}>
            {user ? (
              <LayoutClient>{children}</LayoutClient>
            ) : (
              // Public pages (landing / login / signup) render their own full-height layout
              <>{children}</>
            )}
            <ToasterClient />
          </AuthProvider>
        </PostHogProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
