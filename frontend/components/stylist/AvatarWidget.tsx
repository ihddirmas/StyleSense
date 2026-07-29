"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Mic, Video, VideoOff, AlertCircle, Loader2, Send } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";

// Lazy: livekit-client (used by avatars-react under the hood) touches browser-only APIs.
const AvatarCall = dynamic(
  () => import("@runwayml/avatars-react").then((m) => m.AvatarCall),
  { ssr: false, loading: () => <CenteredSpinner label="Loading SDK..." /> }
);

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full text-center">
      <div>
        <Loader2 size={28} className="spin mx-auto mb-3" style={{ color: "var(--gold)" }} />
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</div>
      </div>
    </div>
  );
}

interface StylistInfo {
  character_id: string;
  name: string | null;
  image_url: string | null;
  status: string;
  ready: boolean;
  voice_name: string | null;
}

export function AvatarWidget() {
  const [stylist, setStylist] = useState<StylistInfo | null>(null);
  const [stylistError, setStylistError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "preparing" | "connecting" | "active" | "ended" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [useCamera, setUseCamera] = useState(true);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [hasMic, setHasMic] = useState<boolean | null>(null);

  // Detect available media devices on mount so we can guide the user.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setHasCamera(false); setHasMic(false); return;
    }
    navigator.mediaDevices.enumerateDevices().then((devs) => {
      const cam = devs.some((d) => d.kind === "videoinput");
      const mic = devs.some((d) => d.kind === "audioinput");
      setHasCamera(cam);
      setHasMic(mic);
      if (!cam) setUseCamera(false);
    }).catch(() => { setHasCamera(false); setHasMic(false); });
  }, []);

  // Fetch the shared stylist + poll status until READY.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const s = await apiGet<StylistInfo>("/api/avatar/stylist");
        if (cancelled) return;
        setStylist(s);
        setStylistError(null);
        if (!s.ready && s.status === "PROCESSING") {
          timer = setTimeout(tick, 5000);
        }
      } catch (e) {
        if (!cancelled) {
          setStylistError(e instanceof Error ? e.message : String(e));
          timer = setTimeout(tick, 8000);
        }
      }
    }
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [phase]);

  if (stylistError && !stylist) {
    return (
      <div className="flex items-center justify-center h-full text-center px-8">
        <div style={{ maxWidth: 420 }}>
          <AlertCircle size={32} className="mx-auto mb-3" style={{ color: "var(--red)" }} />
          <h3 className="font-display text-2xl mb-2">Stylist not configured</h3>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{stylistError}</p>
          <p className="text-xs mt-3" style={{ color: "var(--text-dim)" }}>
            Admin: run <code>python -m scripts.setup_admin_stylist</code> in <code>backend/</code>.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "idle") {
    const noMic = hasMic === false;
    const noCam = hasCamera === false;
    const isProcessing = stylist && !stylist.ready && stylist.status === "PROCESSING";
    const hasFailed = stylist && !stylist.ready && stylist.status === "FAILED";
    const canStart = stylist?.ready && !noMic;

    return (
      <div className="flex items-center justify-center h-full text-center px-8">
        <div style={{ maxWidth: 420 }}>
          {stylist?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stylist.image_url}
              alt={stylist.name || "Stylist"}
              className="rounded-full mx-auto mb-4 object-cover"
              style={{ width: 96, height: 96, border: "2px solid var(--border-gold)" }}
            />
          ) : (
            <div
              className="rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ width: 96, height: 96, background: "var(--surface2)", border: "2px solid var(--border)" }}
            >
              <Mic size={32} style={{ color: "var(--text-dim)" }} />
            </div>
          )}
          <h3 className="font-display text-2xl mb-1">
            {stylist?.name?.split(" - ")[0] || stylist?.name || "Your stylist"}
          </h3>
          <p className="text-xs mb-3" style={{ color: "var(--text-dim)" }}>
            StyleSense admin agent
          </p>

          {isProcessing && (
            <div
              className="surface flex items-center gap-2 px-3 py-2 mb-3 mx-auto justify-center"
              style={{ borderColor: "var(--border-gold)", background: "var(--gold-dim)", maxWidth: 360 }}
            >
              <Loader2 size={14} className="spin" style={{ color: "var(--gold)" }} />
              <span className="text-xs" style={{ color: "var(--text)" }}>
                Stylist is initializing on Runway... ready in ~30 seconds
              </span>
            </div>
          )}
          {hasFailed && (
            <div
              className="surface flex items-center gap-2 px-3 py-2 mb-3 mx-auto justify-center"
              style={{ borderColor: "var(--red)", maxWidth: 360 }}
            >
              <AlertCircle size={14} style={{ color: "var(--red)" }} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Stylist character failed. Admin: re-run setup_admin_stylist.
              </span>
            </div>
          )}
          {stylist?.voice_name && stylist.ready && (
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Voice: {stylist.voice_name}
            </p>
          )}

          {noMic && (
            <div className="surface px-3 py-2 mb-3 flex items-center gap-2 text-xs"
                 style={{ borderColor: "var(--red)", color: "var(--text-muted)" }}>
              <AlertCircle size={14} style={{ color: "var(--red)" }} />
              <span>No microphone detected. Sessions need a mic.</span>
            </div>
          )}

          {!noMic && (
            <div className="flex items-center justify-center gap-2 mb-4">
              <button
                onClick={() => setUseCamera(true)}
                disabled={noCam}
                className={`chip ${useCamera ? "chip-active" : ""}`}
                style={{ opacity: noCam ? 0.4 : 1, cursor: noCam ? "not-allowed" : "pointer" }}
                title={noCam ? "No camera detected" : "Use my camera"}
              >
                <Video size={11} style={{ marginRight: 4 }} />
                Camera {noCam && "(none)"}
              </button>
              <button
                onClick={() => setUseCamera(false)}
                className={`chip ${!useCamera ? "chip-active" : ""}`}
              >
                <VideoOff size={11} style={{ marginRight: 4 }} />
                Audio only
              </button>
            </div>
          )}

          <button
            className="btn-primary"
            onClick={async () => {
              setError(null);
              setPhase("preparing");
              // LOAD-BEARING: await the personality PATCH so Aria sees the user's
              // wardrobe before the realtime session is minted. If this fails
              // we still let them connect (generic persona) but log it.
              try {
                await apiPost("/api/avatar/sync-stylist-kb", {});
              } catch (e) {
                console.warn("[sync-stylist-kb] failed, continuing with stale persona:", e);
              }
              setPhase("connecting");
            }}
            disabled={!canStart}
            title={!canStart ? "Waiting for the stylist to be ready" : undefined}
          >
            {useCamera ? <Video size={14} /> : <Mic size={14} />}
            {isProcessing ? "Waiting for stylist..." : "Start session"}
          </button>

          <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            {useCamera
              ? "Real-time conversation. Browser will ask for mic + camera access."
              : "Audio only — no camera will be used."}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "preparing") {
    return (
      <div className="flex items-center justify-center h-full text-center px-8">
        <div>
          <Loader2 size={28} className="spin mx-auto mb-3" style={{ color: "var(--gold)" }} />
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            Preparing your stylist...
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Syncing your wardrobe so she can suggest specific items.
          </div>
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="flex items-center justify-center h-full text-center px-8">
        <div>
          <h3 className="font-display text-2xl mb-2">Session ended</h3>
          <button className="btn-primary" onClick={() => setPhase("connecting")}>
            Start a new session
          </button>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex items-center justify-center h-full text-center px-8">
        <div style={{ maxWidth: 420 }}>
          <AlertCircle size={32} className="mx-auto mb-3" style={{ color: "var(--red)" }} />
          <h3 className="font-display text-xl mb-2">Couldn&apos;t start session</h3>
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>{error}</p>
          <button className="btn-primary" onClick={() => { setError(null); setPhase("connecting"); }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  // phase === "connecting" or "active"
  return (
    <div className="w-full h-full flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="relative flex items-center justify-center px-2 pt-2" style={{ flex: "1 1 auto", minHeight: 0 }}>
        {stylist && (
          <AvatarCall
            avatarId={stylist.character_id}
            connectUrl="/api/avatar/connect"
            avatarImageUrl={stylist.image_url ?? undefined}
            audio
            video={useCamera}
            onEnd={() => setPhase("ended")}
            onError={(e) => {
              const msg = e?.message || String(e);
              console.error("[AvatarCall onError]", msg);
              const isCameraIssue = /camera|video|NotFoundError|NotReadableError|getUserMedia/i.test(msg);
              if (isCameraIssue && useCamera) {
                setUseCamera(false);
                setError(null);
                setPhase("idle");
                return;
              }
              setError(msg);
              setPhase("error");
            }}
          />
        )}
        {phase === "connecting" && (
          <ConnectingOverlay useCamera={useCamera} onActive={() => setPhase("active")} />
        )}
      </div>
      <TypeToAvatar visible={phase === "active"} />
    </div>
  );
}

function ConnectingOverlay({ useCamera, onActive }: { useCamera: boolean; onActive: () => void }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function check() {
      const v = document.querySelector<HTMLVideoElement>('[data-avatar-call] video');
      if (v && (v.srcObject || v.readyState >= 2)) {
        if (!cancelled) { setHidden(true); onActive(); }
        return true;
      }
      return false;
    }
    if (check()) return;
    const observer = new MutationObserver(() => check());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const fallback = setTimeout(() => { if (!cancelled) setHidden(true); }, 30000);
    return () => { cancelled = true; observer.disconnect(); clearTimeout(fallback); };
  }, [onActive]);

  if (hidden) return null;
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ background: "rgba(8,8,13,0.75)" }}
    >
      <div className="text-center">
        <Loader2 size={28} className="spin mx-auto mb-3" style={{ color: "var(--gold)" }} />
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          Connecting to your stylist...
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
          Allow {useCamera ? "mic + camera" : "mic access"} when the browser asks
        </div>
      </div>
    </div>
  );
}

function TypeToAvatar({ visible }: { visible: boolean }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<string | null>(null);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    const userText = text.trim();
    setText("");
    setReply(null);
    try {
      const data = await apiPost<{ reply: string }>("/api/stylist/chat", {
        messages: [{ role: "user", content: userText }],
      });
      const replyText = data.reply || "(no response)";
      setReply(replyText);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const speak = () => {
          const cleaned = replyText.replace(/\s*\[ITEM:[a-zA-Z0-9\-]+\]/g, "");
          const utter = new SpeechSynthesisUtterance(cleaned);
          const voices = window.speechSynthesis.getVoices();
          const female =
            voices.find((v) => /Jenny|Aria|Samantha|Allison|Zira|female/i.test(v.name)) ||
            voices.find((v) => /female/i.test(v.voiceURI || ""));
          if (female) utter.voice = female;
          utter.rate = 1.0;
          utter.pitch = 1.15;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        };
        if (window.speechSynthesis.getVoices().length === 0) {
          window.speechSynthesis.onvoiceschanged = () => speak();
          setTimeout(speak, 200);
        } else {
          speak();
        }
      }
    } catch (e) {
      setReply(`(failed: ${e instanceof Error ? e.message : "unknown"})`);
    } finally {
      setSending(false);
    }
  }

  if (!visible) return null;
  const cleaned = reply?.replace(/\s*\[ITEM:[a-zA-Z0-9\-]+\]/g, "");

  return (
    <div className="px-3 py-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--border)" }}>
      {cleaned && (
        <div
          className="surface px-3 py-2 text-sm"
          style={{ background: "var(--surface2)", color: "var(--text)" }}
        >
          <strong className="text-xs tracking-wide" style={{ color: "var(--gold)", textTransform: "uppercase" }}>
            Stylist
          </strong>
          <button
onClick={() => setReply(null)}
              className="text-xl"
              style={{
                float: "right", background: "none", border: "none",
                color: "var(--text-dim)", cursor: "pointer",
                lineHeight: 1, padding: 0, marginLeft: 8,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
          <div className="mt-1 whitespace-pre-wrap">{cleaned}</div>
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Type a message to your stylist (the avatar will speak the reply)..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={sending}
        />
        <button className="btn-primary" onClick={send} disabled={!text.trim() || sending}>
          {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
