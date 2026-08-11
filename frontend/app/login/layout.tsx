import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to StyleSenseAI to access your AI wardrobe, virtual try-ons, and stylist chat.",
  robots: { index: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
