"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Plus } from "lucide-react";
import { apiUpload } from "@/lib/api";
import { useAppStore } from "@/store/app";
import { AddItemModal } from "@/components/wardrobe/AddItemModal";
import type { WardrobeItem } from "@/types";

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const setSelected = useAppStore((s) => s.setSelected);

  const [step, setStep] = useState<Step>(1);
  const [uploading, setUploading] = useState(false);
  const [selfieThumb, setSelfieThumb] = useState<string | null>(null);
  const [addedItem, setAddedItem] = useState<WardrobeItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSelfie(file: File) {
    setSelfieThumb(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiUpload("/api/avatar/upload-selfie", fd);
    } catch {
      // non-fatal — thumbnail still shown, user continues
    } finally {
      setUploading(false);
      setStep(2);
    }
  }

  function handleAdded(item: WardrobeItem) {
    setModalOpen(false);
    setAddedItem(item);
    setSelected([item.id]);
    setStep(3);
  }

  function handleAddedMany(items: WardrobeItem[]) {
    setModalOpen(false);
    if (items.length > 0) {
      setAddedItem(items[0]);
      setSelected(items.map((i) => i.id));
    }
    setStep(3);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "var(--parchment)" }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: 24,
          borderRadius: 12,
        }}
      >
        {/* Progress dots */}
        <ProgressDots current={step} total={3} />

        {step === 1 && (
          <StepSelfie
            uploading={uploading}
            selfieThumb={selfieThumb}
            fileRef={fileRef}
            onFile={handleSelfie}
            onSkip={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <StepWardrobe
            onOpenModal={() => setModalOpen(true)}
            onSkip={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <StepReady
            hasItem={!!addedItem}
            onStudio={() => router.push("/studio")}
            onDashboard={() => router.push("/dashboard")}
          />
        )}
      </div>

      {/* AddItemModal rendered at root level so its fixed overlay works correctly */}
      <AddItemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={handleAdded}
        onAddedMany={handleAddedMany}
        compact={true}
      />
    </div>
  );
}

// ── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map((s) => (
        <span
          key={s}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            display: "inline-block",
            background: s <= current ? "var(--ink)" : "transparent",
            border: "1.5px solid var(--ink)",
            transition: "background 0.2s",
          }}
        />
      ))}
    </div>
  );
}

// ── Step 1 — Upload selfie ────────────────────────────────────────────────────

function StepSelfie({
  uploading,
  selfieThumb,
  fileRef,
  onFile,
  onSkip,
}: {
  uploading: boolean;
  selfieThumb: string | null;
  fileRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <h1 className="font-display text-4xl mb-2" style={{ color: "var(--ink)" }}>
        First, let&apos;s set up your avatar.
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Upload a front-facing photo. We&apos;ll use it to show outfits on you.
      </p>

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
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          width: "100%",
          height: 200,
          border: "1.5px dashed var(--border)",
          borderRadius: 8,
          background: "var(--surface2)",
          cursor: uploading ? "default" : "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          overflow: "hidden",
          padding: 0,
          position: "relative",
        }}
        aria-label="Upload selfie"
      >
        {uploading ? (
          <>
            <Loader2 size={28} className="spin" style={{ color: "var(--text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Uploading...
            </span>
          </>
        ) : selfieThumb ? (
          <img
            src={selfieThumb}
            alt="Selfie preview"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <>
            <Camera size={28} style={{ color: "var(--text-dim)" }} />
            <span className="text-sm" style={{ color: "var(--text-dim)" }}>
              Click to upload a photo
            </span>
          </>
        )}
      </button>

      <div className="flex justify-center mt-5">
        <button
          onClick={onSkip}
          className="text-sm"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── Step 2 — Add wardrobe item ────────────────────────────────────────────────

function StepWardrobe({
  onOpenModal,
  onSkip,
}: {
  onOpenModal: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <h1 className="font-display text-4xl mb-2" style={{ color: "var(--ink)" }}>
        Now add something from your wardrobe.
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
        Paste a product URL or upload a photo.
      </p>

      <button
        className="btn-primary"
        onClick={onOpenModal}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        <Plus size={16} />
        Add an item
      </button>

      <div className="flex justify-center mt-5">
        <button
          onClick={onSkip}
          className="text-sm"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── Step 3 — You're ready ─────────────────────────────────────────────────────

function StepReady({
  hasItem,
  onStudio,
  onDashboard,
}: {
  hasItem: boolean;
  onStudio: () => void;
  onDashboard: () => void;
}) {
  return (
    <div className="text-center py-6">
      <h1 className="font-display text-4xl mb-4" style={{ color: "var(--ink)" }}>
        You&apos;re all set.
      </h1>
      {hasItem ? (
        <>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            Head to Studio to try on your first look.
          </p>
          <button className="btn-primary" onClick={onStudio}>
            Try it on &rarr;
          </button>
        </>
      ) : (
        <>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            Explore your wardrobe and add items anytime.
          </p>
          <button className="btn-primary" onClick={onDashboard}>
            Go to Dashboard &rarr;
          </button>
        </>
      )}
    </div>
  );
}
