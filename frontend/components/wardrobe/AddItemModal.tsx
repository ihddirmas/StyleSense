"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Plus, Loader2, Link as LinkIcon, Upload, Check, X, Trash2, Sparkles, Image as ImageIcon } from "lucide-react";
import { apiPost, apiUpload } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import type { WardrobeItem, DetectedItem } from "@/types";

const CATEGORIES = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];
const OCCASIONS = ["any", "casual", "formal", "evening", "sport", "beach"];

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (item: WardrobeItem) => void;
  onAddedMany?: (items: WardrobeItem[]) => void;
  compact?: boolean;
}

function DetectedItemsChecklist({
  sourceUrl,
  initial,
  submitting,
  onCancel,
  onConfirm,
}: {
  sourceUrl: string;
  initial: DetectedItem[];
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (picked: DetectedItem[]) => void;
}) {
  const [rows, setRows] = useState(initial.map((d) => ({ ...d, checked: true })));

  function update(idx: number, patch: Partial<typeof rows[number]>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function remove(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  const checkedCount = rows.filter((r) => r.checked).length;

  return (
    <div>
      <h2 className="font-display text-3xl mb-1">
        {rows.length} item{rows.length === 1 ? "" : "s"} detected
      </h2>
      <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
        Untick to skip, or remove anything you don&apos;t want (e.g. accessories). Adding{" "}
        <strong style={{ color: "var(--gold)" }}>{checkedCount}</strong>. Each is isolated as a clean product shot.
      </p>

      <div className="surface p-3 mb-5 flex items-center gap-3">
        <img src={sourceUrl} alt="Source" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6 }} />
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Your source photo. Each item below will be extracted from it on a clean white background.
        </div>
      </div>

      <div className="space-y-3 mb-5" style={{ maxHeight: 360, overflowY: "auto" }}>
        {rows.map((r, i) => (
          <div
            key={i}
            className="surface p-3 flex items-start gap-3"
            style={{ borderColor: r.checked ? "var(--border-gold)" : "var(--border)", opacity: r.checked ? 1 : 0.55 }}
          >
            <button
              onClick={() => update(i, { checked: !r.checked })}
              className="w-6 h-6 rounded flex items-center justify-center mt-1 flex-shrink-0"
              style={{
                background: r.checked ? "var(--ink)" : "var(--surface2)",
                border: `1px solid ${r.checked ? "var(--ink)" : "var(--border)"}`,
                color: r.checked ? "var(--parchment)" : "var(--text-dim)",
                cursor: "pointer",
              }}
              aria-label={r.checked ? "Uncheck" : "Check"}
            >
              {r.checked ? <Check size={14} /> : <X size={14} />}
            </button>

            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <input
                  className="input"
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="Item name"
                  style={{ fontSize: "0.9rem" }}
                />
              </div>
              <select
                className="input"
                value={r.category}
                onChange={(e) => update(i, { category: e.target.value as DetectedItem["category"] })}
                style={{ fontSize: "0.85rem" }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Color"
                value={r.color || ""}
                onChange={(e) => update(i, { color: e.target.value })}
                style={{ fontSize: "0.85rem" }}
              />
              {r.position && (
                <div className="col-span-2 text-xs" style={{ color: "var(--text-dim)" }}>
                  In source: {r.position}
                </div>
              )}
            </div>

            <button
              onClick={() => remove(i)}
              className="flex-shrink-0 mt-1"
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
              aria-label="Remove this item"
              title="Remove from list"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel} disabled={submitting}>
          Back
        </button>
        <button
          className="btn-primary"
          onClick={() => onConfirm(rows.filter((r) => r.checked).map(({ checked, ...rest }) => rest))}
          disabled={submitting || checkedCount === 0}
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="spin" /> Adding {checkedCount}...
            </>
          ) : (
            <>Add {checkedCount} item{checkedCount === 1 ? "" : "s"}</>
          )}
        </button>
      </div>
    </div>
  );
}

export function AddItemModal({ isOpen, onClose, onAdded, onAddedMany, compact = false }: AddItemModalProps) {
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapedImage, setScrapedImage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("tops");
  const [occasion, setOccasion] = useState("casual");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"form" | "detecting" | "adding" | "checklist">("form");
  const [detected, setDetected] = useState<DetectedItem[]>([]);
  const [detectedSourceUrl, setDetectedSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPhase("form");
      setFile(null);
      setPreview(null);
      setUrl("");
      setScrapedImage(null);
      setName("");
      setCategory("tops");
      setOccasion("casual");
      setColor("");
      setBrand("");
      setSubmitting(false);
      setDetected([]);
      setDetectedSourceUrl(null);
      setTab("upload");
    }
  }, [isOpen]);

  function handleFile(f: File) {
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function scrape() {
    if (!url.trim()) return;
    setScraping(true);
    try {
      const res = await apiPost<{ image_url: string; name: string; suggested_category: string }>(
        "/api/scrape/product-url",
        { url: url.trim() }
      );
      setScrapedImage(res.image_url);
      setName(res.name);
      if (res.suggested_category) setCategory(res.suggested_category);
      toast.success("Product scraped.");
    } catch (e) {
      toast.error(`Could not scrape: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setScraping(false);
    }
  }

  async function submit() {
    if (tab === "url") {
      if (!scrapedImage) { toast.error("Scrape a URL or paste an image link first."); return; }
      setPhase("detecting");
      try {
        const res = await apiPost<{ image_url: string; detected: DetectedItem[] }>(
          "/api/wardrobe/detect-items-url",
          { image_url: scrapedImage }
        );
        if (!res.detected || res.detected.length === 0) {
          toast.error("No clothing items detected in that image.");
          setPhase("form");
          return;
        }
        if (res.detected.length === 1) {
          const r2 = await apiPost<{ created: WardrobeItem[]; failed: { name: string; reason: string }[] }>(
            "/api/wardrobe/add-multi",
            { source_image_url: res.image_url, items: res.detected }
          );
          if (r2.created?.length) { toast.success("Item added."); onAddedMany?.(r2.created); onClose(); }
          else { toast.error(`Could not add: ${r2.failed?.[0]?.reason || "unknown"}`); setPhase("form"); }
          return;
        }
        setDetected(res.detected);
        setDetectedSourceUrl(res.image_url);
        setPhase("checklist");
      } catch (e) {
        toast.error(`Detection failed: ${e instanceof Error ? e.message : "unknown"}`);
        setPhase("form");
      }
      return;
    }

    if (!file) { toast.error("Upload a file first."); return; }
    setPhase("detecting");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiUpload<{ image_url: string; detected: DetectedItem[] }>(
        "/api/wardrobe/detect-items",
        fd
      );
      if (!res.detected || res.detected.length === 0) {
        toast.error("No clothing items detected. Try a clearer photo.");
        setPhase("form");
        return;
      }
      if (res.detected.length === 1) {
        setPhase("adding");
        const d = res.detected[0];
        const fd2 = new FormData();
        fd2.append("file", file);
        fd2.append("name", name.trim() || d.name);
        const finalCategory = compact ? (d.category || "tops") : (category !== "tops" ? category : (d.category || "tops"));
        fd2.append("category", finalCategory);
        if (!compact) fd2.append("occasion", occasion);
        const finalColor = color.trim() || d.color || "";
        const finalBrand = brand.trim() || d.brand || "";
        if (finalColor) fd2.append("color", finalColor);
        if (finalBrand) fd2.append("brand", finalBrand);
        const item = await apiUpload<WardrobeItem>("/api/wardrobe/upload", fd2);
        toast.success("Item added.");
        onAdded?.(item);
        onClose();
        return;
      }
      setDetected(res.detected);
      setDetectedSourceUrl(res.image_url);
      setPhase("checklist");
    } catch (e) {
      toast.error(`Detection failed: ${e instanceof Error ? e.message : "unknown"}`);
      setPhase("form");
    }
  }

  async function confirmMulti(picked: DetectedItem[]) {
    if (!detectedSourceUrl || picked.length === 0) return;
    setSubmitting(true);
    try {
      const res = await apiPost<{ created: WardrobeItem[]; failed: { name: string; reason: string }[] }>(
        "/api/wardrobe/add-multi",
        { source_image_url: detectedSourceUrl, items: picked }
      );
      const okCount = res.created?.length || 0;
      const failCount = res.failed?.length || 0;
      if (okCount > 0) {
        toast.success(
          failCount > 0
            ? `${okCount} item${okCount === 1 ? "" : "s"} added. ${failCount} failed.`
            : `${okCount} item${okCount === 1 ? "" : "s"} added.`
        );
        onAddedMany?.(res.created);
        onClose();
      } else {
        toast.error(`Could not add any items: ${res.failed?.[0]?.reason || "unknown error"}. Try again or upload individually.`);
      }
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center px-4"
          style={{ background: "rgba(8,8,13,0.85)", zIndex: 100 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            className="surface p-7 w-full"
            style={{ maxWidth: phase === "checklist" ? 640 : compact ? 420 : 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            {phase === "detecting" && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 size={32} className="spin mb-4" style={{ color: "var(--text-muted)" }} />
                <h2 className="font-display text-2xl mb-1">Analyzing your photo...</h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Looking for individual clothing items.</p>
              </div>
            )}

            {phase === "adding" && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 size={32} className="spin mb-4" style={{ color: "var(--gold)" }} />
                <h2 className="font-display text-2xl mb-1">Adding to your closet...</h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Cleaning up the garment and saving it.</p>
              </div>
            )}

            {phase === "checklist" && (
              <DetectedItemsChecklist
                sourceUrl={detectedSourceUrl!}
                initial={detected}
                submitting={submitting}
                onCancel={() => setPhase("form")}
                onConfirm={confirmMulti}
              />
            )}

            {phase === "form" && (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-display text-3xl">Add item</h2>
                  <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4 }} aria-label="Close">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex gap-2 mb-5">
                  <button
                    className={`chip ${tab === "upload" ? "chip-active" : ""}`}
                    onClick={() => setTab("upload")}
                  >
                    <Upload size={12} style={{ marginRight: 6 }} /> Upload photo
                  </button>
                  <button
                    className={`chip ${tab === "url" ? "chip-active" : ""}`}
                    onClick={() => setTab("url")}
                  >
                    <LinkIcon size={12} style={{ marginRight: 6 }} /> Product URL
                  </button>
                </div>

                {tab === "upload" ? (
                  <>
                    {!compact && (
                      <p className="text-xs mb-3" style={{ color: "var(--text-dim)" }}>
                        Upload a single item on a clean background, a flat lay of multiple items, or a photo of someone wearing an outfit — we&apos;ll detect and isolate each piece.
                      </p>
                    )}
                    <label
                      className="surface flex items-center justify-center cursor-pointer overflow-hidden mb-4"
                      style={{ width: "100%", height: 180, borderStyle: file ? "solid" : "dashed" }}
                    >
                      {preview ? (
                        <img src={preview} alt="Preview" className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center" style={{ color: "var(--text-dim)" }}>
                          <Upload size={24} className="mx-auto mb-2" />
                          <div className="text-xs">JPG · JPG · PNG · WebP</div>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                      />
                    </label>
                  </>
                ) : (
                  <div className="mb-4">
                    <div className="flex gap-2">
                      <input
                        className="input"
                        placeholder="Product URL, or paste a direct image link"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && scrape()}
                      />
                      <button className="btn-secondary" onClick={scrape} disabled={!url.trim() || scraping} style={{ flexShrink: 0 }}>
                        {scraping ? <Loader2 size={15} className="spin" /> : "Fetch"}
                      </button>
                    </div>
                    <div className="text-xs mt-2" style={{ color: "var(--text-dim)" }}>
                      Big retailers (H&M, Amazon, Zara) block scraping — for those, right-click the
                      product image, &ldquo;Copy image address&rdquo;, and paste that link here.
                    </div>
                    {scrapedImage && (
                      <div className="surface mt-3 p-3 flex items-center gap-3">
                        <img src={scrapedImage} alt="Scraped" style={{ width: 64, height: 64, objectFit: "contain" }} />
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>Product image found — fill in the details below and save.</div>
                      </div>
                    )}
                  </div>
                )}

                {!compact && (
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="col-span-2">
                      <label className="label">Name *</label>
                      <input className="input" placeholder="Navy linen blazer" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Category</label>
                      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Occasion</label>
                      <select className="input" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                        {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Color</label>
                      <input className="input" placeholder="navy" value={color} onChange={(e) => setColor(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Brand</label>
                      <input className="input" placeholder="optional" value={brand} onChange={(e) => setBrand(e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-6">
                  <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
                  <button className="btn-primary" onClick={submit} disabled={submitting}>
                    {submitting ? <><Loader2 size={16} className="spin" /> Saving...</> : "Add to wardrobe"}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}