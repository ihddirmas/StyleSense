import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/", "/login", "/signup", "/auth/callback", "/pricing",
  // Programmatic SEO style guides — must stay crawlable without a login redirect.
  "/style",
  // Crawler-facing files: a login redirect here makes them invisible to search engines.
  "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/opengraph-image.png",
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() reads the JWT from cookies locally -- no network round-trip
  // to Supabase's auth server, unlike getUser(). Safe here because this check
  // only drives a UX redirect (send logged-out users to /login, logged-in
  // users away from /login), not an authorization decision -- every real API
  // call independently re-verifies the JWT server-side via current_user
  // (see backend/services/auth_service.py), so a stale/forged cookie here
  // can at worst show a page shell, never bypass real auth. root layout.tsx
  // still uses the fully-verified getUser() for the data it actually renders.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || (p !== "/" && path.startsWith(p + "/")));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Authenticated users skip the marketing landing and the auth pages.
  if (user && (path === "/" || path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on every page except static assets, crawler files, and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
