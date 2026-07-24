"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session, User, AuthChangeEvent } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useAriaChat } from "@/store/ariaChat";
import { useAppStore } from "@/store/app";
import posthog from "posthog-js";

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

  const fetchProfile = useCallback(async (uid: string) => {
    // users table has selfie/avatar/stylized fields; profiles table has share_code + social fields.
    // Merge both so the Profile context has everything.
    const [u, p] = await Promise.all([
      supabase.from("users").select(
        "id, email, full_name, username, avatar_url, avatar_selfie_url, stylized_avatar_url, stylized_avatar_video_url, stylized_avatar_video_status"
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
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, sess: Session | null) => {
      syncUserScope(sess?.user?.id ?? null);
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        fetchProfile(sess.user.id);
        posthog.identify(sess.user.id, {
          name: sess.user.user_metadata?.full_name ?? undefined,
        });
      } else {
        setProfile(null);
      }
      // Force a refetch of server components when auth changes
      router.refresh();
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
