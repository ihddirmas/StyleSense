import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@runwayml/avatars-react/styles.css";
import { LayoutClient } from "@/components/layout/LayoutClient";
import { Toaster } from "@/components/ui/Toast";
import { AuthProvider } from "@/components/AuthProvider";
import { getSupabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "StyleSense — AI Wardrobe & Virtual Try-On",
    template: "%s · StyleSense",
  },
  description:
    "StyleSense is your AI-powered wardrobe and virtual try-on studio. Upload a selfie, add clothes, see yourself in any outfit, place yourself in any scene, animate the look as video, and chat with a stylist that knows your closet.",
  keywords: [
    "AI wardrobe",
    "virtual try-on",
    "AI stylist",
    "outfit generator",
    "fashion AI",
    "StyleSense",
  ],
  applicationName: "StyleSense",
  openGraph: {
    title: "StyleSense — AI Wardrobe & Virtual Try-On",
    description:
      "Upload a selfie, try on outfits with AI, animate them as video, and chat with a stylist that knows your closet.",
    type: "website",
    siteName: "StyleSense",
  },
  twitter: {
    card: "summary_large_image",
    title: "StyleSense — AI Wardrobe & Virtual Try-On",
    description:
      "Upload a selfie, try on outfits with AI, animate them as video, and chat with a stylist that knows your closet.",
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
        <AuthProvider initialUser={user} initialProfile={profile}>
          {user ? (
            <LayoutClient>{children}</LayoutClient>
          ) : (
            // Public pages (landing / login / signup) render their own full-height layout
            <>{children}</>
          )}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
