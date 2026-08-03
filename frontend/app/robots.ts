import type { MetadataRoute } from "next";
import { PRODUCTION_SITE_URL } from "@/lib/api-base";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/studio", "/stylist", "/wardrobe", "/outfits", "/friends", "/chat", "/settings", "/onboarding", "/api/"],
    },
    sitemap: `${PRODUCTION_SITE_URL}/sitemap.xml`,
  };
}
