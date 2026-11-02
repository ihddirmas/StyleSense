"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Loader2, Link as LinkIcon, Upload, Check, X, Trash2 } from "lucide-react";
import { apiPost, apiUpload } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import type { WardrobeItem, DetectedItem } from "@/types";
import posthog from "posthog-js";

const CATEGORIES = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"];
const OCCASIONS = ["any", "casual", "formal", "evening", "sport", "beach"];
const MAX_GALLERY_PHOTOS = 12;

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
        <strong style={{ color: "var(--on-gold)" }}>{checkedCount}</strong>. Each is isolated as a clean product shot.
      </p>

      <div className="surface p-3 mb-5 flex items-center gap-3">
        <img src={sourceUrl} alt="Source" className="rounded-sm" style={{ width: 60, height: 60, objectFit: "cover" }} />
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
                />
              </div>
              <select
                className="input"
                value={r.category}
                onChange={(e) => update(i, { category: e.target.value as DetectedItem["category"] })}
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

type GalleryEntry = { file: File; preview: string };

export function AddItemModal({ isOpen, onClose, onAdded, onAddedMany, compact = false }: AddItemModalProps) {
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [gallery, setGallery] = useState<GalleryEntry[]>([]);
  const [url, setUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapedImage, setScrapedImage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("tops");
  const [occasion, setOccasion] = useState("casual");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"form" | "detecting" | "adding" | "checklist" | "batch">("form");
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, label: "" });
  const [detected, setDetected] = useState<DetectedItem[]>([]);
  const [detectedSourceUrl, setDetectedSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPhase("form");
      setGallery([]);
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
      setBatchProgress({ current: 0, total: 0, label: "" });
      setTab("upload");
    }
  }, [isOpen]);

  function handleFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (!incoming.length) return;
    const room = MAX_GALLERY_PHOTOS - gallery.length;
    const slice = incoming.slice(0, Math.max(0, room));
    if (incoming.length > room) {
      toast.error(`You can import up to ${MAX_GALLERY_PHOTOS} photos at once.`);
    }
    slice.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        setGallery((prev) => {
          if (prev.length >= MAX_GALLERY_PHOTOS) return prev;
          if (prev.some((g) => g.file.name === f.name && g.file.size === f.size)) return prev;
          return [...prev, { file: f, preview: reader.result as string }];
        });
      };
      reader.readAsDataURL(f);
    });
  }

  function removeGalleryAt(idx: number) {
    setGallery((prev) => prev.filter((_, i) => i !== idx));
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

  async function addDetectedFromSource(
    sourceUrl: string,
    items: DetectedItem[],
    method: string
  ): Promise<WardrobeItem[]> {
    const res = await apiPost<{ created: WardrobeItem[]; failed: { name: string; reason: string }[] }>(
      "/api/wardrobe/add-multi",
      { source_image_url: sourceUrl, items }
    );
    if (res.created?.length) {
      posthog.capture("wardrobe_item_added", { method, item_count: res.created.length });
    }
    return res.created || [];
  }

  async function processSingleFile(file: File): Promise<"checklist" | "done" | "empty"> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiUpload<{ image_url: string; detected: DetectedItem[] }>(
      "/api/wardrobe/detect-items",
      fd
    );
    if (!res.detected || res.detected.length === 0) return "empty";

    if (res.detected.length === 1) {
      setPhase("adding");
      const d = res.detected[0];
      const fd2 = new FormData();
      fd2.append("file", file);
      fd2.append("name", name.trim() || d.name);
      const finalCategory = compact
        ? d.category || "tops"
        : category !== "tops"
          ? category
          : d.category || "tops";
      fd2.append("category", finalCategory);
      if (!compact) fd2.append("occasion", occasion);
      const finalColor = color.trim() || d.color || "";
      const finalBrand = brand.trim() || d.brand || "";
      if (finalColor) fd2.append("color", finalColor);
      if (finalBrand) fd2.append("brand", finalBrand);
      const item = await apiUpload<WardrobeItem>("/api/wardrobe/upload", fd2);
      posthog.capture("wardrobe_item_added", { method: "upload", item_count: 1, category: finalCategory });
      toast.success("Item added.");
      onAdded?.(item);
      onClose();
      return "done";
    }

    setDetected(res.detected);
    setDetectedSourceUrl(res.image_url);
    setPhase("checklist");
    return "checklist";
  }

  async function processGalleryBatch(entries: GalleryEntry[]) {
    setPhase("batch");
    const createdAll: WardrobeItem[] = [];
    let failPhotos = 0;
    const total = entries.length;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      setBatchProgress({
        current: i + 1,
        total,
        label: `Scanning photo ${i + 1} of ${total}…`,
      });
      try {
        const fd = new FormData();
        fd.append("file", entry.file);
        const res = await apiUpload<{ image_url: string; detected: DetectedItem[] }>(
          "/api/wardrobe/detect-items",
          fd
        );
        if (!res.detected?.length) {
          failPhotos += 1;
          continue;
        }
        setBatchProgress({
          current: i + 1,
          total,
          label: `Adding ${res.detected.length} item${res.detected.length === 1 ? "" : "s"} from photo ${i + 1}…`,
        });
        const created = await addDetectedFromSource(res.image_url, res.detected, "gallery_batch");
        createdAll.push(...created);
        if (!created.length) failPhotos += 1;
      } catch {
        failPhotos += 1;
      }
    }

    if (createdAll.length) {
      toast.success(
        failPhotos > 0
          ? `${createdAll.length} item${createdAll.length === 1 ? "" : "s"} added. ${failPhotos} photo${failPhotos === 1 ? "" : "s"} skipped.`
          : `${createdAll.length} item${createdAll.length === 1 ? "" : "s"} added from your gallery.`
      );
      onAddedMany?.(createdAll);
      onClose();
    } else {
      toast.error("Could not add items from those photos. Try clearer shots or add one at a time.");
      setPhase("form");
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
          const created = await addDetectedFromSource(res.image_url, res.detected, "url");
          if (created.length) {
            toast.success("Item added.");
            onAddedMany?.(created);
            onClose();
          } else {
            toast.error("Could not add item.");
            setPhase("form");
          }
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

    if (!gallery.length) { toast.error("Upload a file first."); return; }

    if (gallery.length > 1) {
      await processGalleryBatch(gallery);
      return;
    }

    setPhase("detecting");
    try {
      const result = await processSingleFile(gallery[0].file);
      if (result === "empty") {
        toast.error("No clothing items detected. Try a clearer photo.");
        setPhase("form");
      }
    } catch (e) {
      toast.error(`Detection failed: ${e instanceof Error ? e.message : "unknown"}`);
      setPhase("form");
    }
  }

  async function confirmMulti(picked: DetectedItem[]) {
    if (!detectedSourceUrl || picked.length === 0) return;
    setSubmitting(true);
    try {
      const created = await addDetectedFromSource(detectedSourceUrl, picked, "multi_detect");
      const okCount = created.length;
      if (okCount > 0) {
        toast.success(`${okCount} item${okCount === 1 ? "" : "s"} added.`);
        onAddedMany?.(created);
        onClose();
      } else {
        toast.error("Could not add any items. Try again or upload individually.");
      }
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSubmitting(false);
    }
  }

  const singlePreview = gallery.length === 1 ? gallery[0].preview : null;

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
                <Loader2 size={32} className="spin mb-4" style={{ color: "var(--on-gold)" }} />
                <h2 className="font-display text-2xl mb-1">Adding to your closet...</h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Cleaning up the garment and saving it.</p>
              </div>
            )}

            {phase === "batch" && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 size={32} className="spin mb-4" style={{ color: "var(--on-gold)" }} />
                <h2 className="font-display text-2xl mb-1">
                  Importing gallery
                </h2>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  {batchProgress.label || "Working through your photos…"}
                </p>
                <div className="w-full max-w-xs h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                  <div
                    className="h-full transition-all"
                    style={{
                      width: batchProgress.total
                        ? `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`
                        : "8%",
                      background: "var(--ink)",
                    }}
                  />
                </div>
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
                      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                        Pick one photo or a whole batch from your camera roll — we detect and isolate each piece.
                      </p>
                    )}
                    <label
                      className="surface flex items-center justify-center cursor-pointer overflow-hidden mb-3"
                      style={{ width: "100%", height: gallery.length > 1 ? 120 : 180, borderStyle: gallery.length ? "solid" : "dashed" }}
                    >
                      {singlePreview ? (
                        <img src={singlePreview} alt="Preview" className="w-full h-full object-contain" />
                      ) : gallery.length > 1 ? (
                        <div className="text-center" style={{ color: "var(--text-dim)" }}>
                          <Upload size={22} className="mx-auto mb-2" />
                          <div className="text-xs">{gallery.length} photos selected — tap to add more</div>
                        </div>
                      ) : (
                        <div className="text-center" style={{ color: "var(--text-dim)" }}>
                          <Upload size={24} className="mx-auto mb-2" />
                          <div className="text-xs">JPG · PNG · WebP — one or many</div>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) handleFiles(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>

                    {gallery.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                        {gallery.map((g, i) => (
                          <div key={`${g.file.name}-${i}`} className="relative shrink-0">
                            <img
                              src={g.preview}
                              alt=""
                              className="rounded-sm"
                              style={{ width: 56, height: 56, objectFit: "cover" }}
                            />
                            <button
                              type="button"
                              aria-label="Remove photo"
                              onClick={() => removeGalleryAt(i)}
                              className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ background: "var(--ink)", color: "var(--parchment)", border: "none", cursor: "pointer" }}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {gallery.length === 1 && (
                      <button
                        type="button"
                        className="text-xs mb-3 flex items-center gap-1"
                        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
                        onClick={() => setGallery([])}
                      >
                        <X size={12} /> Clear photo
                      </button>
                    )}
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

                {!compact && gallery.length <= 1 && (
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

                {gallery.length > 1 && (
                  <p className="text-xs mb-3" style={{ color: "var(--text-dim)" }}>
                    Batch mode adds every item we find in each photo (up to {MAX_GALLERY_PHOTOS} photos).
                  </p>
                )}

                <div className="flex justify-end gap-2 mt-6">
                  <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
                  <button className="btn-primary" onClick={submit} disabled={submitting}>
                    {submitting ? (
                      <><Loader2 size={16} className="spin" /> Saving...</>
                    ) : gallery.length > 1 ? (
                      <><Plus size={16} /> Import {gallery.length} photos</>
                    ) : (
                      "Add to wardrobe"
                    )}
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
