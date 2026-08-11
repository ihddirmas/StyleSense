import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description:
    "Create your free StyleSenseAI account. Upload a selfie and start trying on outfits with AI in seconds.",
  robots: { index: false },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
