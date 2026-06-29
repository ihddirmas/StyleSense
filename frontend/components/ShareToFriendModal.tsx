"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { X, Send, Loader2, Users } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { toast } from "@/components/ui/Toast";

interface FriendRow {
  friendship_id: string;
  status: string;
  i_sent_request: boolean;
  other: { id: string; full_name: string | null; email: string | null; share_code: string };
}

export interface ShareTarget {
  outfit_id?: string;
  tryon_id?: string;
  preview_image_url?: string;
  label: string;
}

export function ShareToFriendModal({
  target, onClose,
}: {
  target: ShareTarget;
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [caption, setCaption] = useState("");
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    apiGet<FriendRow[]>("/api/friends")
      .then((data) => setFriends(data.filter((f) => f.status === "accepted")))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function send(otherId: string) {
    setSendingTo(otherId);
    try {
      await apiPost("/api/chat/send", {
        recipient_id: otherId,
        shared_outfit_id: target.outfit_id,
        shared_tryon_id: target.tryon_id,
        shared_caption: caption.trim() || undefined,
      });
      toast.success("Shared!");
      onClose();
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ background: "rgba(8,8,13,0.85)", zIndex: 100 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        className="surface p-6 w-full"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--gold)" }}>
              Share with a friend
            </div>
            <div className="font-display text-2xl mt-1">{target.label}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        {target.preview_image_url && (
          <div className="surface mb-4 overflow-hidden" style={{ maxWidth: 120 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={target.preview_image_url} alt="Preview" style={{ width: 120, aspectRatio: "3/4", objectFit: "cover" }} />
          </div>
        )}

        <div className="mb-4">
          <label className="label">Caption (optional)</label>
          <input
            className="input"
            placeholder="What do you think?"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>

        <div className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
          Pick a friend
        </div>
        {loading ? (
          <div className="text-center py-6">
            <Loader2 size={18} className="spin mx-auto" style={{ color: "var(--gold)" }} />
          </div>
        ) : friends.length === 0 ? (
          <div className="surface p-6 text-center" style={{ color: "var(--text-muted)" }}>
            <Users size={20} className="mx-auto mb-2" style={{ color: "var(--text-dim)" }} />
            <p className="text-sm mb-3">No friends yet.</p>
            <Link href="/friends" className="btn-primary inline-flex" style={{ padding: "0.4rem 0.9rem" }}>
              Find a friend
            </Link>
          </div>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-auto">
            {friends.map((f) => {
              const initial = (f.other.full_name?.[0] || f.other.email?.[0] || "?").toUpperCase();
              return (
                <div
                  key={f.friendship_id}
                  className="surface px-3 py-2.5 flex items-center gap-3"
                >
                  <div
                    className="rounded-full flex items-center justify-center font-semibold text-sm"
                    style={{
                      width: 34, height: 34,
                      background: "var(--gold-dim)", color: "var(--gold)",
                      border: "1px solid var(--border-gold)",
                    }}
                  >
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {f.other.full_name || f.other.email}
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {f.other.email}
                    </div>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => send(f.other.id)}
                    disabled={!!sendingTo}
                    style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
                  >
                    {sendingTo === f.other.id ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                    Send
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
