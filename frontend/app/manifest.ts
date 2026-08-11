import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StyleSenseAI — AI Wardrobe & Virtual Try-On",
    short_name: "StyleSenseAI",
    description: "AI-powered wardrobe, virtual try-on, and personal stylist.",
    start_url: "/",
    display: "standalone",
    background_color: "#DDD9CE",
    theme_color: "#E7E2BC",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
