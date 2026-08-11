import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { getStyleGuide, getAllSlugs, STYLE_GUIDES } from "@/lib/seo/style-guide-data";
import { PRODUCTION_SITE_URL } from "@/lib/api-base";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const guide = getStyleGuide(params.slug);
  if (!guide) return {};
  const { garment, occasion } = guide;
  const title = `What to Wear: ${capitalize(garment.label)} for a ${capitalize(occasion.label)}`;
  const description = `How to style a ${garment.label} for a ${occasion.label} — silhouette, color, and pairing tips, plus see it on yourself with StyleSenseAI's try-on.`;
  return {
    title,
    description,
    alternates: { canonical: `/style/${guide.slug}` },
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// For full sentences (tip strings) — capitalize only the first letter, not every word.
function sentenceCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export default function StyleGuidePage({ params }: { params: { slug: string } }) {
  const guide = getStyleGuide(params.slug);
  if (!guide) notFound();
  const { garment, occasion } = guide;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${capitalize(garment.label)} for a ${capitalize(occasion.label)}`,
    description: `Styling guide: how to wear a ${garment.label} to a ${occasion.label}.`,
    author: { "@type": "Organization", name: "StyleSenseAI" },
    publisher: { "@type": "Organization", name: "StyleSenseAI" },
    mainEntityOfPage: `${PRODUCTION_SITE_URL}/style/${guide.slug}`,
  };

  const related = STYLE_GUIDES
    .filter((g) => g.slug !== guide.slug && (g.garment.id === garment.id || g.occasion.id === occasion.id))
    .slice(0, 6);

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="px-4 md:px-8 py-5" style={{ borderBottom: "2px solid var(--ink)" }}>
        <Link href="/" className="font-display tracking-tight" style={{ color: "var(--ink)", fontSize: "1.5rem", textDecoration: "none" }}>
          StyleSenseAI
        </Link>
      </header>

      <article className="max-w-2xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <nav aria-label="Breadcrumb" className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          <Link href="/style" style={{ color: "inherit", textDecoration: "none" }} className="hover:underline">Style guides</Link>
          {" / "}{capitalize(occasion.label)}
        </nav>

        <h1 className="font-display text-3xl md:text-4xl leading-tight mb-3" style={{ color: "var(--ink)" }}>
          What to Wear: {capitalize(garment.label)} for a {capitalize(occasion.label)}
        </h1>

        <p className="text-base mb-8" style={{ color: "var(--text)" }}>
          A {occasion.label} calls for a look that's {occasion.dressCode}. Here's how to make a{" "}
          {garment.label} work for it — plus a way to actually see it on yourself before you commit.
        </p>

        <section className="mb-8">
          <h2 className="font-display text-xl mb-3" style={{ color: "var(--ink)" }}>Getting the silhouette right</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text)" }}>
            For this occasion, look for {garment.silhouette}. {sentenceCase(garment.fabricNote)}.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            {garment.pairingTips.map((tip) => (
              <li key={tip} className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{sentenceCase(tip)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-xl mb-3" style={{ color: "var(--ink)" }}>Color and finishing touches</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            {garment.colorTips.map((tip) => (
              <li key={tip} className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{sentenceCase(tip)}</li>
            ))}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="font-display text-xl mb-3" style={{ color: "var(--ink)" }}>What the occasion actually needs</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text)" }}>
            A {occasion.label} is {occasion.dressCode}.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            {occasion.practicalTips.map((tip) => (
              <li key={tip} className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{sentenceCase(tip)}</li>
            ))}
          </ul>
        </section>

        <section
          className="surface p-6 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between"
          style={{ borderColor: "var(--border-hover)" }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={14} style={{ color: "var(--on-gold)" }} />
              <span className="text-2xs font-mono uppercase tracking-widest" style={{ color: "var(--on-gold)" }}>
                See it on you
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--text)" }}>
              Paste a product link or upload a photo — StyleSenseAI generates a try-on so you can see this look on your own body before you buy.
            </p>
          </div>
          <Link
            href="/signup"
            className="btn-primary shrink-0 flex items-center gap-2"
            style={{ textDecoration: "none" }}
          >
            Try it free <ArrowRight size={14} />
          </Link>
        </section>

        {related.length > 0 && (
          <section>
            <h2 className="font-display text-xl mb-3" style={{ color: "var(--ink)" }}>More style guides</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {related.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/style/${g.slug}`}
                    className="surface surface-hover block px-3 py-2 text-sm"
                    style={{ textDecoration: "none", color: "var(--text)" }}
                  >
                    {capitalize(g.garment.label)} for a {g.occasion.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
