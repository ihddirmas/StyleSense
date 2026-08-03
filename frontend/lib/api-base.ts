/** Live Render backend (see README.md — master deploy). */
export const PRODUCTION_API_URL = "https://styleai-backend-5vk9.onrender.com";

export const PRODUCTION_SITE_URL = "https://style-sense-beryl.vercel.app";

export function resolveApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return PRODUCTION_API_URL;
  return "http://localhost:8000";
}
