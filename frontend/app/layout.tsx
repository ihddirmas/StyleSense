import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@runwayml/avatars-react/styles.css";
import { LayoutClient } from "@/components/layout/LayoutClient";
import { Toaster } from "@/components/ui/Toast";
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
    default: "StyleSense — AI Style Agent & Virtual Try-On",
    template: "%s · StyleSense",
  },
  description:
    "StyleSense is your AI style agent and virtual try-on studio. Aria knows your wardrobe, recommends outfits, and runs confirm-gated actions — add items, try on looks, look up products.",
  keywords: [
    "AI wardrobe",
    "virtual try-on",
    "AI style agent",
    "outfit generator",
    "fashion AI",
    "StyleSense",
  ],
  applicationName: "StyleSense",
  openGraph: {
    title: "StyleSense — AI Wardrobe & Virtual Try-On",
    description:
      "Meet Aria — your AI style agent. Outfit picks, try-ons, and closet actions from a wardrobe she actually knows.",
    type: "website",
    siteName: "StyleSense",
  },
  twitter: {
    card: "summary_large_image",
    title: "StyleSense — AI Wardrobe & Virtual Try-On",
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
      <body>
        <PostHogProvider>
          <AuthProvider initialUser={user} initialProfile={profile}>
            {user ? (
              <LayoutClient>{children}</LayoutClient>
            ) : (
              // Public pages (landing / login / signup) render their own full-height layout
              <>{children}</>
            )}
            <Toaster />
          </AuthProvider>
        </PostHogProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
