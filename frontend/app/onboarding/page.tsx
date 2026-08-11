"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus, Sun } from "lucide-react";
import { apiGet, apiUpload } from "@/lib/api";
import { useAppStore } from "@/store/app";
import { AddItemModal } from "@/components/wardrobe/AddItemModal";
import type { WardrobeItem } from "@/types";
import { getPostHogPublicKey } from "@/lib/posthog-key";
import posthog from "posthog-js";

type Step = 1 | 2 | 3 | 4 | 5;

const PHOTO_TIPS = [
  "Stand near a window — natural daylight, not warm lamps",
  "No heavy filters or beauty mode",
  "Face the camera directly",
];

const BODY_TIPS = [
  "Full body visible head to toe",
  "Stand straight, arms slightly away from body",
  "Fitted clothes help us read your proportions",
];

interface ColorProfile {
  season?: string;
  undertone?: string;
  confidence?: number;
  flattering_colors?: string[];
  notes?: string;
}

interface KibbeAnalysis {
  kibbe_type?: string;
  confidence?: number;
  notes?: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const setSelected = useAppStore((s) => s.setSelected);

  const [step, setStep] = useState<Step>(1);
  const [uploading, setUploading] = useState(false);
  const [selfieThumb, setSelfieThumb] = useState<string | null>(null);
  const [bodyThumb, setBodyThumb] = useState<string | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [colorProfile, setColorProfile] = useState<ColorProfile | null>(null);
  const [kibbeProfile, setKibbeProfile] = useState<KibbeAnalysis | null>(null);
  const [addedItem, setAddedItem] = useState<WardrobeItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const faceRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (getPostHogPublicKey()) posthog.capture("onboarding_step_started", { step });
  }, [step]);

  useEffect(() => {
    if (step !== 3) return;
    setProfilesLoading(true);
    let attempts = 0;
    const poll = () => {
      apiGet<{
        color_profile: ColorProfile | null;
        kibbe_analysis: KibbeAnalysis | null;
        ready: boolean;
      }>("/api/stylist/profiles")
        .then((d) => {
          setColorProfile(d.color_profile);
          setKibbeProfile(d.kibbe_analysis);
          if (d.ready || attempts >= 12) {
            setProfilesLoading(false);
            if (d.ready && getPostHogPublicKey()) {
              posthog.capture("profiles_generated", {
                color_confidence: d.color_profile?.confidence,
                kibbe_confidence: d.kibbe_analysis?.confidence,
              });
            }
            return;
          }
          attempts += 1;
          setTimeout(poll, 2500);
        })
        .catch(() => setProfilesLoading(false));
    };
    poll();
  }, [step]);

  async function handleSelfie(file: File) {
    setSelfieThumb(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload("/api/avatar/upload-selfie", fd);
      if (getPostHogPublicKey()) posthog.capture("onboarding_step_completed", { step: 1 });
      setStep(2);
    } catch {
      setStep(2);
    } finally {
      setUploading(false);
    }
  }

  async function handleFullBody(file: File) {
    setBodyThumb(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload("/api/avatar/upload-full-body", fd);
      if (getPostHogPublicKey()) posthog.capture("onboarding_step_completed", { step: 2 });
      setStep(3);
    } catch {
      setStep(3);
    } finally {
      setUploading(false);
    }
  }

  function handleAdded(item: WardrobeItem) {
    setModalOpen(false);
    setAddedItem(item);
    setSelected([item.id]);
    if (getPostHogPublicKey()) posthog.capture("onboarding_step_completed", { step: 4 });
    setStep(5);
  }

  function handleAddedMany(items: WardrobeItem[]) {
    setModalOpen(false);
    if (items.length > 0) {
      setAddedItem(items[0]);
      setSelected(items.map((i) => i.id));
    }
    if (getPostHogPublicKey()) posthog.capture("onboarding_step_completed", { step: 4 });
    setStep(5);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-bg">
      <div className="w-full max-w-md surface border border-border rounded-sm p-6">
        <ProgressDots current={step} total={5} />

        {step === 1 && (
          <PhotoStep
            title="Face selfie for your color season"
            tips={PHOTO_TIPS}
            uploading={uploading}
            thumb={selfieThumb}
            fileRef={faceRef}
            onFile={handleSelfie}
            onSkip={() => setStep(2)}
            skipLabel="Skip (lower accuracy)"
          />
        )}

        {step === 2 && (
          <PhotoStep
            title="Full-body photo for Kibbe typing"
            tips={BODY_TIPS}
            uploading={uploading}
            thumb={bodyThumb}
            fileRef={bodyRef}
            onFile={handleFullBody}
            onSkip={() => setStep(3)}
            skipLabel="Skip Kibbe for now"
          />
        )}

        {step === 3 && (
          <ProfileReveal
            loading={profilesLoading}
            color={colorProfile}
            kibbe={kibbeProfile}
            onContinue={() => setStep(4)}
          />
        )}

        {step === 4 && (
          <div>
            <h1 className="font-display text-3xl mb-2 text-foreground">Add something to evaluate</h1>
            <p className="text-sm text-muted mb-6">
              Paste a Myntra/Amazon URL or upload a photo — Aria will tell you if it suits your profile.
            </p>
            <button
              type="button"
              className="btn-primary w-full flex items-center justify-center gap-2"
              onClick={() => setModalOpen(true)}
            >
              <Plus size={16} /> Add an item
            </button>
            <div className="flex justify-center mt-5">
              <button type="button" className="text-sm text-muted underline" onClick={() => setStep(5)}>
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="text-center py-4">
            <h1 className="font-display text-3xl mb-3 text-foreground">You&apos;re ready</h1>
            <p className="text-sm text-muted mb-6">
              {addedItem
                ? `Ask Aria whether "${addedItem.name}" suits your ${colorProfile?.season || "color"} palette.`
                : "Head to Aria and paste any product URL for a grounded verdict."}
            </p>
            <button
              type="button"
              className="btn-primary w-full mb-3"
              onClick={() => {
                if (getPostHogPublicKey()) {
                  posthog.capture("onboarding_completed", { has_item: !!addedItem, destination: "stylist" });
                }
                router.push(addedItem ? "/stylist" : "/stylist");
              }}
            >
              Talk to Aria
            </button>
            <button
              type="button"
              className="btn-ghost w-full text-sm"
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>

      <AddItemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={handleAdded}
        onAddedMany={handleAddedMany}
        compact
      />
    </div>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map((s) => (
        <span
          key={s}
          className="inline-block h-2 w-2 rounded-full border border-ink transition-colors"
          style={{ background: s <= current ? "var(--ink)" : "transparent" }}
        />
      ))}
    </div>
  );
}

function PhotoStep({
  title,
  tips,
  uploading,
  thumb,
  fileRef,
  onFile,
  onSkip,
  skipLabel,
}: {
  title: string;
  tips: string[];
  uploading: boolean;
  thumb: string | null;
  fileRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
  onSkip: () => void;
  skipLabel: string;
}) {
  return (
    <div>
      <h1 className="font-display text-3xl mb-2 text-foreground">{title}</h1>
      <ul className="text-sm text-muted mb-4 space-y-1 list-none p-0 m-0">
        {tips.map((t) => (
          <li key={t} className="flex items-start gap-2">
            <Sun size={14} className="shrink-0 mt-0.5 opacity-60" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full h-48 border border-dashed border-border bg-surface-2 rounded-sm flex flex-col items-center justify-center gap-2 overflow-hidden"
      >
        {uploading ? (
          <>
            <Loader2 size={28} className="spin text-muted" />
            <span className="text-sm text-muted">Analyzing…</span>
          </>
        ) : thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="Preview" className="w-full h-full object-cover" />
        ) : (
          <>
            <Camera size={28} className="text-muted" />
            <span className="text-sm text-muted">Tap to upload</span>
          </>
        )}
      </button>
      <div className="flex justify-center mt-5">
        <button type="button" className="text-sm text-muted underline" onClick={onSkip}>
          {skipLabel}
        </button>
      </div>
    </div>
  );
}

function ProfileReveal({
  loading,
  color,
  kibbe,
  onContinue,
}: {
  loading: boolean;
  color: ColorProfile | null;
  kibbe: KibbeAnalysis | null;
  onContinue: () => void;
}) {
  const season = color?.season
    ? String(color.season).replace(/^./, (c) => c.toUpperCase())
    : null;
  const kibbeName = kibbe?.kibbe_type
    ? String(kibbe.kibbe_type).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div>
      <h1 className="font-display text-3xl mb-2 text-foreground">Your style profile</h1>
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-muted text-sm justify-center">
          <Loader2 size={18} className="spin" /> Reading your coloring and proportions…
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {season ? (
            <div className="border border-border rounded-lg p-4 bg-surface-2">
              <p className="text-xs uppercase tracking-wider text-muted mb-1">Color season</p>
              <p className="font-display text-xl">{season}</p>
              <p className="text-sm text-muted mt-1">
                {color?.undertone} undertone
                {color?.confidence != null && color.confidence < 0.7
                  ? " · medium confidence — natural light helps"
                  : ""}
              </p>
              {color?.flattering_colors && color.flattering_colors.length > 0 && (
                <p className="text-xs mt-2 text-muted">
                  Flattering: {color.flattering_colors.slice(0, 4).join(", ")}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Color analysis still processing — you can continue and check Settings later.</p>
          )}
          {kibbeName ? (
            <div className="border border-border rounded-lg p-4 bg-surface-2">
              <p className="text-xs uppercase tracking-wider text-muted mb-1">Kibbe type</p>
              <p className="font-display text-xl">{kibbeName}</p>
              {kibbe?.notes && <p className="text-sm text-muted mt-1">{kibbe.notes}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted">Add a full-body photo later in Settings for Kibbe typing.</p>
          )}
        </div>
      )}
      <button type="button" className="btn-primary w-full" onClick={onContinue} disabled={loading}>
        Continue
      </button>
    </div>
  );
}
