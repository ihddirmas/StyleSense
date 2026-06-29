"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Mail, Lock, User, ArrowRight } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/Toast";

interface AuthCardProps {
  initialMode: "login" | "signup";
  next: string;
}

export function AuthCard({ initialMode, next }: AuthCardProps) {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  function switchMode(m: "login" | "signup") {
    setMode(m);
    setName("");
    setEmail("");
    setPassword("");
  }

  async function submit() {
    if (!email || !password) { toast.error("Email and password required"); return; }
    if (mode === "signup" && password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Welcome back.");
      router.push(next);
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name || email.split("@")[0] },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      if (data.user && !data.session) {
        toast.info("Check your email to confirm your account, then sign in.");
        router.push("/login");
      } else {
        toast.success("Welcome to StyleSense!");
        router.push(next);
        router.refresh();
      }
    }
  }

  async function googleSignIn() {
    setOauthLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { setOauthLoading(false); toast.error(error.message); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface w-full max-w-md p-8"
      style={{ position: "relative", zIndex: 2 }}
    >
      {/* Brand */}
      <div className="mb-6 text-center">
        <div className="font-display text-4xl mb-1" style={{ color: "var(--ink)" }}>StyleSense</div>
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          {mode === "login" ? "Sign in to your closet" : "Build your editorial closet"}
        </p>
      </div>

      {/* Mode toggle */}
      <div
        className="flex mb-6"
        style={{
          background: "var(--surface2)",
          borderRadius: "var(--radius-sm)",
          padding: 3,
          border: "1px solid var(--border)",
        }}
      >
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            style={{
              flex: 1,
              padding: "0.45rem 0",
              fontSize: "0.8rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              transition: "all 0.2s",
              background: mode === m ? "var(--surface)" : "transparent",
              color: mode === m ? "var(--ink)" : "var(--text-muted)",
              boxShadow: mode === m ? "0 1px 4px rgba(60,36,21,0.10)" : "none",
            }}
          >
            {m === "login" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>

      {/* Google */}
      <button
        className="btn-secondary w-full mb-4 flex items-center justify-center gap-2"
        onClick={googleSignIn}
        disabled={oauthLoading || loading}
      >
        {oauthLoading ? <Loader2 size={16} className="spin" /> : <GoogleColorIcon />}
        Continue with Google
      </button>

      <div className="flex items-center gap-3 my-5 text-xs" style={{ color: "var(--text-muted)" }}>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        OR
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

      {/* Animated form fields */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="space-y-3 mb-5"
        >
          {mode === "signup" && (
            <div>
              <label className="label">
                <User size={11} style={{ display: "inline", marginRight: 6 }} />
                Name (optional)
              </label>
              <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label">
              <Mail size={11} style={{ display: "inline", marginRight: 6 }} />
              Email
            </label>
            <input
              className="input" type="email" autoComplete="email"
              placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">
              <Lock size={11} style={{ display: "inline", marginRight: 6 }} />
              Password
            </label>
            <input
              className="input" type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "login" ? "••••••••" : "6+ characters"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        </motion.div>
      </AnimatePresence>

      <button className="btn-primary w-full" onClick={submit} disabled={loading || oauthLoading}>
        {loading
          ? <><Loader2 size={16} className="spin" /> {mode === "login" ? "Signing in..." : "Creating account..."}</>
          : <>{mode === "login" ? "Sign in" : "Create account"} <ArrowRight size={14} /></>
        }
      </button>
    </motion.div>
  );
}

function GoogleColorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5c-2.1 1.4-4.7 2.3-7.6 2.3-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.5 5.5C41.5 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
