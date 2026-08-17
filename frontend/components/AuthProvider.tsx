"use client";
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { Session, User, AuthChangeEvent } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { getPostHogPublicKey } from "@/lib/posthog-key";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAriaChat } from "@/store/ariaChat";
import { useAppStore } from "@/store/app";

// Clear per-user client state (Aria chat + cached avatar/selfie) so a different
// account on the same browser never inherits the previous user's data.
function clearUserScopedStores() {
  try {
    useAriaChat.getState().reset();
    useAppStore.getState().resetUserData();
  } catch {
    // stores not ready yet - ignore
  }
}

// Wipe stores when the signed-in user id differs from the last one we saw.
function syncUserScope(uid: string | null) {
  if (typeof window === "undefined") return;
  const last = window.localStorage.getItem("stylesense-last-user");
  if (uid && uid !== last) {
    if (last) clearUserScopedStores(); // a different account took over this browser
    window.localStorage.setItem("stylesense-last-user", uid);
  }
}

// Google OAuth has no client-side "signup vs login" branch point (unlike the
// password form) — the redirect through /auth/callback happens server-side.
// A first-ever sign-in has created_at == last_sign_in_at (within Supabase's
// own clock skew); use that as the "brand-new account" signal, guarded by a
// per-user localStorage flag so it only fires once per account on this browser.
function isFreshOAuthSignup(user: User): boolean {
  if (typeof window === "undefined") return false;
  const key = `stylesense-signup-tracked-${user.id}`;
  if (window.localStorage.getItem(key)) return false;
  const created = new Date(user.created_at).getTime();
  const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : created;
  const isFresh = Math.abs(lastSignIn - created) < 10_000;
  window.localStorage.setItem(key, "1");
  return isFresh;
}

// Ties PostHog events to the real user id instead of an anonymous device id.
// No-op if PostHog isn't configured (PostHogProvider never calls posthog.init()).
function identifyForAnalytics(user: User | null) {
  if (!getPostHogPublicKey()) return;
  if (user) {
    posthog.identify(user.id, { email: user.email });
    if (user.app_metadata?.provider === "google" && isFreshOAuthSignup(user)) {
      posthog.capture("signup_completed", { method: "google" });
    }
  } else {
    posthog.reset();
  }
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  share_code: string;
  avatar_url: string | null;
  avatar_selfie_url: string | null;
  stylized_avatar_url: string | null;
  stylized_avatar_video_url: string | null;
  stylized_avatar_video_status: string | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children, initialUser, initialProfile }: {
  children: React.ReactNode;
  initialUser: User | null;
  initialProfile: Profile | null;
}) {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialUser);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [loading, setLoading] = useState(false);
  // Tracks the current user id for the onAuthStateChange listener below,
  // which is registered once on mount -- reading `user` state there would
  // be a stale closure, always seeing whatever it was at mount time.
  const userIdRef = useRef<string | null>(initialUser?.id ?? null);

  const fetchProfile = useCallback(async (uid: string) => {
    // users table has selfie/avatar/stylized fields; profiles table has share_code + social fields.
    // Merge both so the Profile context has everything.
    const [u, p] = await Promise.all([
      supabase.from("users").select(
        "id, email, full_name, avatar_selfie_url, stylized_avatar_url, stylized_avatar_video_url, stylized_avatar_video_status"
      ).eq("id", uid).single(),
      supabase.from("profiles").select("share_code, username, full_name, avatar_url, email").eq("id", uid).single(),
    ]);
    if (u.data || p.data) {
      setProfile({ ...(u.data || {}), ...(p.data || {}) } as Profile);
    }
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      syncUserScope(session?.user?.id ?? null);
      userIdRef.current = session?.user?.id ?? null;
      setSession(session);
      // Keep the same object reference when the user id hasn't actually
      // changed -- otherwise every effect with `[user]` in its deps (cache
      // warming, per-page data fetches) re-fires on every redundant auth
      // event, multiplying API calls needlessly.
      setUser((prev) => (prev?.id === session?.user?.id ? prev : (session?.user ?? null)));
      identifyForAnalytics(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, sess: Session | null) => {
      syncUserScope(sess?.user?.id ?? null);
      // TOKEN_REFRESHED fires silently in the background every ~50-60min (or
      // on tab refocus) for a still-valid session -- same user, renewed JWT.
      // router.refresh() below re-runs middleware.ts's cookie-based session
      // check; if the browser's refreshed token hasn't finished syncing to
      // the cookie yet, that read can transiently see no session and bounce
      // an actively-logged-in user to /login. Only a real identity change
      // (sign in/out, or switching accounts) needs a server refetch.
      const identityChanged = sess?.user?.id !== userIdRef.current;
      userIdRef.current = sess?.user?.id ?? null;
      setSession(sess);
      setUser((prev) => (prev?.id === sess?.user?.id ? prev : (sess?.user ?? null)));
      identifyForAnalytics(sess?.user ?? null);
      if (sess?.user) {
        fetchProfile(sess.user.id);
        if (getPostHogPublicKey()) {
          posthog.identify(sess.user.id, {
            name: sess.user.user_metadata?.full_name ?? undefined,
          });
        }
      } else {
        setProfile(null);
      }
      if (identityChanged) router.refresh();
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase, fetchProfile, router]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const signOut = useCallback(async () => {
    setLoading(true);
    clearUserScopedStores();
    if (typeof window !== "undefined") window.localStorage.removeItem("stylesense-last-user");
    posthog.capture("user_logged_out");
    posthog.reset();
    await supabase.auth.signOut();
    // Hard navigation so the middleware re-evaluates with cleared cookies.
    // router.push is a client-side SPA nav and doesn't re-run the middleware.
    window.location.href = "/";
  }, [supabase]);

  return (
    <Ctx.Provider value={{ user, session, profile, loading, refreshProfile, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
