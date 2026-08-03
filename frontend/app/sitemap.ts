import type { MetadataRoute } from "next";
import { PRODUCTION_SITE_URL } from "@/lib/api-base";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/pricing", "/login", "/signup"];
  return routes.map((route) => ({
    url: `${PRODUCTION_SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
}
