"use client";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { LogOut, Camera, Loader2, Star, Trash2, Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAppStore } from "@/store/app";
import { useTasks } from "@/store/tasks";
import { useAuth } from "@/components/AuthProvider";
import { TRYON_MODELS, VIDEO_MODELS } from "@/lib/models";
import { apiGet, apiPost, apiUpload, apiDelete } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/Dialog";

interface SkinConcernScore {
  type: string;
  ui_score?: number | null;
  raw_score?: number | null;
}

interface SkinAnalysisResult {
  colors?: Record<string, string>;
  fitzpatrick?: { fitzpatrick_type?: string; fitzpatrick_label?: string } | null;
  face_shape?: { face_shape?: string | null } | null;
  skin_concerns?: { concerns?: SkinConcernScore[] } | null;
}

const PORTRAIT_SAMPLES = [
  { name: "Amara", url: "/avatars/sample-1.jpg" },
  { name: "Mei",   url: "/avatars/sample-2.jpg" },
  { name: "Sofia", url: "/avatars/sample-3.jpg" },
  { name: "Yuki",  url: "/avatars/sample-4.jpg" },
  { name: "Elle",  url: "/avatars/sample-5.jpg" },
  { name: "Luna",  url: "/avatars/sample-6.jpg" },
];

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const {
    tryonModel, videoModel, setTryonModel, setVideoModel,
    avatarSelfieUrl, setSelfieOnly,
  } = useAppStore();

  const [selfies, setSelfies] = useState<string[]>([]);
  const [primaryUrl, setPrimaryUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
  const [fullBodyUrl, setFullBodyUrl] = useState<string | null>(null);
  const [uploadingFull, setUploadingFull] = useState(false);
  const [kibbeAnalysis, setKibbeAnalysis] = useState<{ kibbe_type?: string; notes?: string } | null>(null);
  const [analyzingBody, setAnalyzingBody] = useState(false);
  const [skinColors, setSkinColors] = useState<Record<string, string> | null>(null);
  const [fitzpatrick, setFitzpatrick] = useState<string | null>(null);
  const [faceShape, setFaceShape] = useState<string | null>(null);
  const [skinConcerns, setSkinConcerns] = useState<SkinConcernScore[] | null>(null);
  const [skinConcernsError, setSkinConcernsError] = useState<string | null>(null);
  const [analyzingSkin, setAnalyzingSkin] = useState(false);
  const avatarTask = useTasks((s) =>
    s.tasks.find((t) => (t.kind === "avatar_still" || t.kind === "avatar_video") && t.status === "running")
  );

  const refreshSelfies = useCallback(async () => {
    try {
      const data = await apiGet<{ selfie_urls: string[]; primary_url: string | null }>("/api/avatar/selfies");
      setSelfies(data.selfie_urls);
      setPrimaryUrl(data.primary_url);
      if (data.primary_url && data.primary_url !== avatarSelfieUrl) {
        setSelfieOnly(data.primary_url);
        setSelectedSeed(null);
      }
    } catch {}
  }, [avatarSelfieUrl, setSelfieOnly]);

  useEffect(() => {
    if (!user) return;
    refreshSelfies();
    apiGet<{ full_body_url: string | null }>("/api/avatar/full-body")
      .then((d) => setFullBodyUrl(d.full_body_url))
      .catch(() => {});
    apiGet<{ kibbe_analysis: { kibbe_type?: string; notes?: string } | null }>("/api/stylist/profiles")
      .then((d) => setKibbeAnalysis(d.kibbe_analysis))
      .catch(() => {});
    apiGet<{ status: string; result: SkinAnalysisResult | null }>("/api/skin/status")
      .then((d) => {
        setSkinColors(d.result?.colors ?? null);
        setFitzpatrick(d.result?.fitzpatrick?.fitzpatrick_label ?? null);
        setFaceShape(d.result?.face_shape?.face_shape ?? null);
        const concerns = d.result?.skin_concerns?.concerns ?? null;
        setSkinConcerns(concerns?.length ? concerns : null);
        setSkinConcernsError(
          d.result && d.result.skin_concerns === null && d.status === "ready"
            ? "Skin concern scores unavailable."
            : null,
        );
      })
      .catch(() => {});
  }, [user, refreshSelfies]);

  async function handleAnalyzeSkin() {
    setAnalyzingSkin(true);
    setSkinConcernsError(null);
    try {
      const result = await apiPost<SkinAnalysisResult>("/api/skin/analyze", {});
      setSkinColors(result.colors ?? null);
      setFitzpatrick(result.fitzpatrick?.fitzpatrick_label ?? null);
      setFaceShape(result.face_shape?.face_shape ?? null);
      const concerns = result.skin_concerns?.concerns ?? null;
      setSkinConcerns(concerns?.length ? concerns : null);
      if (!concerns?.length) {
        setSkinConcernsError("Skin concern scores unavailable.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Skin analysis failed.");
    } finally {
      setAnalyzingSkin(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiUpload<{ selfie_url: string; selfie_urls?: string[] }>("/api/avatar/upload-selfie", fd);
      setSelfieOnly(res.selfie_url);
      if (res.selfie_urls) setSelfies(res.selfie_urls);
      await refreshSelfies();
      toast.success("Selfie uploaded.");
      // Backend auto-kicks off stylized-avatar generation off this selfie;
      // track it so it shows up in Activity instead of silently finishing.
      useTasks.getState().watchAvatarStill();
    } catch (e) {
      toast.error(`Upload failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleSetPrimary(url: string) {
    try {
      const fd = new FormData();
      fd.append("url", url);
      const res = await apiUpload<{ primary_url: string }>("/api/avatar/set-primary-selfie", fd);
      setPrimaryUrl(res.primary_url);
      setSelfieOnly(res.primary_url);
      toast.success("Primary selfie updated.");
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async function handleDelete(url: string) {
    try {
      await apiDelete<{ selfie_urls: string[]; primary_url: string | null }>(
        `/api/avatar/selfie?url=${encodeURIComponent(url)}`
      );
      await refreshSelfies();
      toast.success("Selfie removed.");
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async function handleUploadFullBody(file: File) {
    setUploadingFull(true);
    setKibbeAnalysis(null);
    const localUrl = URL.createObjectURL(file);
    setFullBodyUrl(localUrl);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiUpload<{ full_body_url: string }>("/api/avatar/upload-full-body", fd);
      setFullBodyUrl(res.full_body_url || localUrl);
      toast.success("Body photo uploaded — analyzing your proportions...");
      // Only actually kicks off generation server-side the first time (no
      // avatar yet) — watchAvatarStill quietly no-ops otherwise.
      useTasks.getState().watchAvatarStill();
      pollKibbeAnalysis();
    } catch (e) {
      toast.error(`Upload failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setUploadingFull(false);
    }
  }

  function pollKibbeAnalysis() {
    setAnalyzingBody(true);
    let attempts = 0;
    const poll = () => {
      apiGet<{ kibbe_analysis: { kibbe_type?: string; notes?: string } | null; has_kibbe: boolean }>("/api/stylist/profiles")
        .then((d) => {
          if (d.has_kibbe || attempts >= 12) {
            setKibbeAnalysis(d.kibbe_analysis);
            setAnalyzingBody(false);
            return;
          }
          attempts += 1;
          setTimeout(poll, 2500);
        })
        .catch(() => setAnalyzingBody(false));
    };
    poll();
  }

  function selectPortrait(name: string, url: string) {
    setSelectedSeed(name);
    setSelfieOnly(url);
  }

  const slotHint =
    selfies.length === 0 ? "Front-facing, shoulders visible." :
    selfies.length < 3 ? `${3 - selfies.length} more slot${3 - selfies.length === 1 ? "" : "s"} available.` :
    "Delete one to upload another.";

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader eyebrow="Preferences" title="Settings" tutorialKey="settings" subtitle="Generation quality, avatar photos, and account." />

      {avatarTask && (
        <div
          className="flex items-center gap-2 px-3 py-2 mb-4"
          style={{ background: "var(--gold-dim)", border: "1px solid var(--border-gold)" }}
        >
          <Loader2 size={14} className="spin" style={{ color: "var(--on-gold)" }} />
          <span className="text-xs" style={{ color: "var(--text)" }}>
            {avatarTask.kind === "avatar_video" ? "Generating your ramp-walk video…" : "Generating your stylized avatar…"}
          </span>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-5 pb-8 ${selfies.length === 0 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>

        {/* COL 1 — Generation quality + Account */}
        <div className="flex flex-col gap-5">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface p-6">
            <h2 className="font-display text-2xl mb-1">Generation quality</h2>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              Speed vs. quality for try-ons and animations.
            </p>
            <div className="flex flex-col gap-5">
              <ModelPicker label="Try-on model" value={tryonModel} options={TRYON_MODELS} onChange={setTryonModel} />
              <ModelPicker label="Video model"  value={videoModel}  options={VIDEO_MODELS}  onChange={setVideoModel}  />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="surface p-6">
            <h2 className="font-display text-2xl mb-1">Account</h2>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>{user?.email}</p>
            <button className="btn-secondary flex items-center gap-2" onClick={signOut}>
              <LogOut size={15} /> Sign out
            </button>
          </motion.div>
        </div>

        {/* COL 2 — Face photos + Body silhouette + Body analysis */}
        <div className="flex flex-col gap-5">
          {/* Face photos */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="surface p-6">
            <div className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: "var(--ink)" }}>
              Face photos
            </div>
            <div className="flex gap-3 mb-2 flex-wrap">
              {selfies.map((url) => {
                const isPrimary = url === primaryUrl;
                return (
                  <div key={url} className="relative group overflow-hidden flex-shrink-0"
                    style={{ width: 100, height: 122, border: isPrimary ? "2px solid var(--ink)" : "1.5px solid var(--border)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Selfie" className="w-full h-full object-cover" />
                    {isPrimary && (
                      <div className="absolute top-1 left-1 px-1.5 py-0.5 text-2xs font-semibold flex items-center gap-1"
                        style={{ background: "var(--ink)", color: "#fff" }}>
                        <Star size={9} /> Primary
                      </div>
                    )}
                    {!isPrimary && (
                      <button onClick={() => handleSetPrimary(url)}
                        className="absolute top-1 left-1 px-1.5 py-0.5 text-2xs opacity-100 md:opacity-0 md:group-hover:opacity-100 transition flex items-center gap-1"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", cursor: "pointer" }}>
                        <Star size={9} /> Set primary
                      </button>
                    )}
                    <button onClick={() => setPendingDelete(url)}
                      className="absolute top-1 right-1 p-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--red)", cursor: "pointer" }}
                      aria-label="Remove">
                      <Trash2 size={10} />
                    </button>
                  </div>
                );
              })}
              {selfies.length < 3 && (
                <label className="flex flex-col items-center justify-center cursor-pointer flex-shrink-0"
                  style={{ width: 100, height: 122, border: "2px dashed rgba(60,36,21,0.45)", color: "var(--text-muted)" }}>
                  {uploading
                    ? <Loader2 size={20} className="spin" style={{ color: "var(--on-gold)" }} />
                    : selfies.length === 0
                      ? <><Camera size={20} className="mb-1" /><span className="text-xs">Add selfie</span></>
                      : <><Plus size={20} className="mb-1" /><span className="text-xs">Add another</span></>
                  }
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                </label>
              )}
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{slotHint}</p>
          </motion.div>

          {/* Body analysis */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="surface p-6">
            <div className="text-xs uppercase tracking-widest mb-1 font-semibold" style={{ color: "var(--ink)" }}>
              Body analysis
              <span className="ml-2 px-1.5 py-0.5 text-xs tracking-wide"
                style={{ background: "var(--gold-dim)", color: "var(--text-muted)" }}>
                Optional
              </span>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Upload a full-body standing photo — Aria reads your proportions and colour palette.
            </p>
            <div className="flex items-start gap-3">
              <label className="flex flex-col items-center justify-center cursor-pointer flex-shrink-0"
                style={{ width: 72, height: 90, border: fullBodyUrl ? "2px solid var(--ink)" : "2px dashed rgba(60,36,21,0.45)",
                  color: "var(--text-muted)", position: "relative", overflow: "hidden" }}>
                {uploadingFull
                  ? <Loader2 size={18} className="spin" style={{ color: "var(--on-gold)" }} />
                  : fullBodyUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={fullBodyUrl} alt="Full body" className="w-full h-full object-cover" />
                    : <><Camera size={16} className="mb-1" /><span className="text-2xs text-center px-1">Full body</span></>
                }
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUploadFullBody(e.target.files[0])} />
              </label>
              {analyzingBody
                ? <div className="flex-1 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)", paddingTop: 4 }}>
                    <Loader2 size={13} className="spin" style={{ color: "var(--on-gold)" }} />
                    Analyzing your proportions...
                  </div>
                : kibbeAnalysis?.kibbe_type
                ? <div className="flex-1 p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <div className="text-2xs uppercase tracking-widest mb-1" style={{ color: "var(--text-dim)" }}>
                      {kibbeAnalysis.kibbe_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </div>
                    {kibbeAnalysis.notes && (
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>{kibbeAnalysis.notes}</p>
                    )}
                  </div>
                : fullBodyUrl
                ? <p className="text-xs flex-1" style={{ color: "var(--text-muted)", paddingTop: 4 }}>
                    Still processing — check back in a bit.
                  </p>
                : <p className="text-xs flex-1" style={{ color: "var(--text-muted)", paddingTop: 4 }}>
                    Face forward, arms relaxed. Any outfit is fine.
                  </p>
              }
            </div>
          </motion.div>

          {/* Skin tone analysis (YouCam Skin AI) */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="surface p-6">
            <div className="text-xs uppercase tracking-widest mb-1 font-semibold flex items-center gap-1.5" style={{ color: "var(--ink)" }}>
              <Sparkles size={13} style={{ color: "var(--on-gold)" }} />
              Skin tone
              <span className="ml-1 px-1.5 py-0.5 text-xs tracking-wide"
                style={{ background: "var(--gold-dim)", color: "var(--text-muted)" }}>
                Optional
              </span>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Detected from your primary selfie via YouCam Skin AI — Aria uses these tones alongside your color season.
            </p>
            {skinColors
              ? <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    {Object.entries(skinColors).filter(([, hex]) => hex).map(([key, hex]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <div className="w-6 h-6 flex-shrink-0" style={{ background: hex, border: "1px solid var(--border)" }} />
                        <div className="text-2xs" style={{ color: "var(--text-muted)" }}>
                          <div className="uppercase tracking-wide">{key.replace("_color", "")}</div>
                          <div className="font-mono">{hex}</div>
                        </div>
                      </div>
                    ))}
                    <button onClick={handleAnalyzeSkin} disabled={analyzingSkin || !primaryUrl}
                      className="text-2xs underline ml-auto" style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
                      {analyzingSkin ? "Re-analyzing..." : "Re-analyze"}
                    </button>
                  </div>
                  {fitzpatrick && (
                    <div className="text-2xs" style={{ color: "var(--text-muted)" }}>
                      Fitzpatrick scale: <span className="font-mono" style={{ color: "var(--text)" }}>{fitzpatrick}</span>
                    </div>
                  )}
                  {faceShape && (
                    <div className="text-2xs" style={{ color: "var(--text-muted)" }}>
                      Face shape: <span className="font-mono capitalize" style={{ color: "var(--text)" }}>{faceShape}</span>
                    </div>
                  )}
                </div>
              : <button onClick={handleAnalyzeSkin} disabled={analyzingSkin || !primaryUrl}
                  className="btn-secondary text-xs" style={{ opacity: !primaryUrl ? 0.5 : 1 }}>
                  {analyzingSkin
                    ? <><Loader2 size={13} className="spin" /> Analyzing...</>
                    : <><Sparkles size={13} /> Analyze my skin</>
                  }
                </button>
            }
            {(analyzingSkin || skinConcerns || skinConcernsError) && (
              <div className="mt-3 p-3" style={{ border: "1px solid var(--border)", background: "var(--surface2)" }}>
                <div className="text-2xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                  Skin concern scores (YouCam Skin AI)
                </div>
                {analyzingSkin && !skinConcerns
                  ? <div className="text-xs flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                      <Loader2 size={13} className="spin" /> Analyzing skin concerns...
                    </div>
                  : skinConcerns
                  ? <div className="flex flex-col gap-1">
                      {skinConcerns.map((c) => (
                        <div key={c.type} className="text-xs flex justify-between gap-4" style={{ color: "var(--text)" }}>
                          <span className="capitalize">{c.type}</span>
                          <span className="font-mono">{c.ui_score ?? "—"}/100</span>
                        </div>
                      ))}
                    </div>
                  : <p className="text-xs" style={{ color: "var(--text-muted)" }}>{skinConcernsError}</p>
                }
              </div>
            )}
            {!primaryUrl && <p className="text-2xs mt-2" style={{ color: "var(--text-dim)" }}>Add a selfie above first.</p>}
          </motion.div>
        </div>

        {/* COL 3 — Sample portraits (onboarding aid: only relevant before the user has their own selfie) */}
        {selfies.length === 0 && (
          <div className="flex flex-col gap-5">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="surface p-6 flex-1">
              <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
                Or try with a sample look
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PORTRAIT_SAMPLES.map(({ name, url }) => {
                  const isSelected = selectedSeed === name;
                  return (
                    <button key={name} onClick={() => selectPortrait(name, url)} title={name}
                      style={{
                        background: "var(--surface2)", padding: 0, border: "none", cursor: "pointer",
                        outline: isSelected ? "2px solid var(--ink)" : "2px solid transparent",
                        outlineOffset: 2, transition: "outline-color 0.1s", overflow: "hidden",
                      }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                      <div className="text-2xs py-1 text-center" style={{ color: "var(--text-muted)" }}>{name}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                Upload your own selfie for personalised try-ons.
              </p>
            </motion.div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Remove this selfie?"
        description="It'll be removed from your gallery. Try-ons that already used it stay intact."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (pendingDelete) handleDelete(pendingDelete); }}
      />
    </div>
  );
}

function ModelPicker({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string; blurb: string }[];
  onChange: (id: string) => void;
}) {
  const groupId = `model-picker-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={groupId}>
      <div id={groupId} className="text-xs uppercase tracking-widest mb-2 font-semibold" style={{ color: "var(--ink)" }}>
        {label}
      </div>
      <div className="flex gap-2 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            aria-pressed={value === opt.id}
            className="text-left px-4 py-2.5 text-sm transition-all"
            style={{
              background: value === opt.id ? "var(--parchment)" : "var(--surface2)",
              border: value === opt.id ? "2px solid var(--ink)" : "1.5px solid var(--border)",
              color: "var(--ink)",
              cursor: "pointer",
            }}
          >
            <div className="font-semibold">{opt.label}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{opt.blurb}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
