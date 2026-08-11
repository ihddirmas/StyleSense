import type { Metadata } from "next";
import Link from "next/link";
import { STYLE_GUIDES, OCCASIONS } from "@/lib/seo/style-guide-data";

export const metadata: Metadata = {
  title: "Style Guides — What to Wear for Every Occasion",
  description: "Styling guides for real occasions — beach weddings, interviews, first dates, and more — plus see any look on yourself with StyleSenseAI's try-on.",
  alternates: { canonical: "/style" },
};

function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StyleGuideHub() {
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 md:px-8 py-5" style={{ borderBottom: "2px solid var(--ink)" }}>
        <Link href="/" className="font-display tracking-tight" style={{ color: "var(--ink)", fontSize: "1.5rem", textDecoration: "none" }}>
          StyleSenseAI
        </Link>
      </header>

      <div className="max-w-4xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <h1 className="font-display text-3xl md:text-4xl leading-tight mb-3" style={{ color: "var(--ink)" }}>
          Style Guides
        </h1>
        <p className="text-base mb-10 max-w-xl" style={{ color: "var(--text)" }}>
          What to actually wear, broken down by occasion — then see it on yourself before you buy.
        </p>

        {OCCASIONS.map((occasion) => {
          const guides = STYLE_GUIDES.filter((g) => g.occasion.id === occasion.id);
          if (guides.length === 0) return null;
          return (
            <section key={occasion.id} className="mb-9">
              <h2 className="font-display text-xl mb-3" style={{ color: "var(--ink)" }}>
                {capitalize(occasion.label)}
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {guides.map((g) => (
                  <li key={g.slug}>
                    <Link
                      href={`/style/${g.slug}`}
                      className="surface surface-hover block px-3 py-2 text-sm"
                      style={{ textDecoration: "none", color: "var(--text)" }}
                    >
                      {capitalize(g.garment.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
