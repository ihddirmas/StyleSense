import type { MetadataRoute } from "next";
import { PRODUCTION_SITE_URL } from "@/lib/api-base";
import { getAllSlugs } from "@/lib/seo/style-guide-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/pricing", "/login", "/signup", "/style"];
  const staticEntries: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `${PRODUCTION_SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
  const styleGuideEntries: MetadataRoute.Sitemap = getAllSlugs().map((slug) => ({
    url: `${PRODUCTION_SITE_URL}/style/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.6,
  }));
  return [...staticEntries, ...styleGuideEntries];
}
