"use client";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search, UserPlus, Check, X, Users, Loader2, Copy, MessagesSquare,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/components/AuthProvider";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/Dialog";

interface SearchResult {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  share_code: string;
  relationship: "friend" | "request_sent" | "request_received" | null;
}

interface FriendRow {
  friendship_id: string;
  status: "pending" | "accepted" | "declined";
  i_sent_request: boolean;
  other: { id: string; full_name: string | null; email: string | null; username: string | null; share_code: string };
  created_at: string;
}

export default function FriendsPage() {
  const { user, profile } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [copied, setCopied] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<FriendRow | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<FriendRow[]>("/api/friends");
      setFriends(data);
    } catch (e) {
      toast.error(`Failed to load friends: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  async function search() {
    if (!query.trim() || query.trim().length < 2) {
      toast.error("Type at least 2 characters."); return;
    }
    setSearching(true);
    try {
      const data = await apiGet<SearchResult[]>(`/api/friends/search?q=${encodeURIComponent(query.trim())}`);
      setResults(data);
      if (data.length === 0) toast.info("No matches.");
    } catch (e) {
      toast.error(`Search failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSearching(false);
    }
  }

  async function sendRequest(addresseeId: string) {
    try {
      await apiPost("/api/friends/request", { addressee_id: addresseeId });
      toast.success("Request sent.");
      // Optimistically update result row
      setResults((prev) => prev.map((r) => r.id === addresseeId ? { ...r, relationship: "request_sent" } : r));
      refresh();
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async function respond(friendshipId: string, accept: boolean) {
    try {
      await apiPost("/api/friends/respond", { friendship_id: friendshipId, accept });
      toast.success(accept ? "Friend added." : "Request declined.");
      refresh();
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async function performRemove(friendshipId: string) {
    try {
      await apiDelete(`/api/friends/${friendshipId}`);
      toast.success("Removed.");
      refresh();
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  function copyShareCode() {
    if (!profile?.share_code) return;
    navigator.clipboard.writeText(profile.share_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Share code copied.");
  }

  const accepted = friends.filter((f) => f.status === "accepted");
  const incoming = friends.filter((f) => f.status === "pending" && !f.i_sent_request);
  const outgoing = friends.filter((f) => f.status === "pending" && f.i_sent_request);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0">
        <PageHeader
          tutorialKey="friends"
          subtitle="Search by email, username, or share code. Once you're friends you can DM and share outfits."
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-16">
      {/* Your share code card */}
      <div
        className="surface p-5 mb-6 flex items-center justify-between"
      >
        <div>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            Your share code
          </div>
          <div className="font-mono text-2xl" style={{ color: "var(--text)", letterSpacing: "0.15em" }}>
            {profile?.share_code || "..."}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Share this with a friend. They paste it in their search to add you.
          </p>
        </div>
        <button onClick={copyShareCode} className="btn-secondary" disabled={!profile?.share_code}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Search bar */}
      <div className="surface p-5 mb-8">
        <div className="text-xs uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
          Add a friend
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Email, username, or share code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className="btn-primary" onClick={search} disabled={searching}>
            {searching ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
            Search
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-4 space-y-2">
            {results.map((r) => (
              <SearchResultRow key={r.id} r={r} onSend={() => sendRequest(r.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <Section title="Incoming requests" count={incoming.length} eyebrow="action needed">
          <div className="space-y-2">
            {incoming.map((f) => (
              <FriendRow key={f.friendship_id} friend={f}
                actions={
                  <>
                    <button className="btn-primary" onClick={() => respond(f.friendship_id, true)}
                            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                      <Check size={14} /> Accept
                    </button>
                    <button className="btn-secondary" onClick={() => respond(f.friendship_id, false)}
                            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                      <X size={14} /> Decline
                    </button>
                  </>
                } />
            ))}
          </div>
        </Section>
      )}

      {/* Outgoing pending */}
      {outgoing.length > 0 && (
        <Section title="Pending (sent)" count={outgoing.length}>
          <div className="space-y-2">
            {outgoing.map((f) => (
              <FriendRow key={f.friendship_id} friend={f}
                actions={
                  <>
                    <span className="chip">Awaiting reply</span>
                    <button className="btn-secondary" onClick={() => setPendingRemove(f)}
                            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                      <X size={14} /> Cancel
                    </button>
                  </>
                } />
            ))}
          </div>
        </Section>
      )}

      {/* Friends */}
      <Section title="Your friends" count={accepted.length}>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="surface p-4 shimmer" style={{ height: 70 }} />)}
          </div>
        ) : accepted.length === 0 ? (
          <div className="surface p-8 text-center" style={{ color: "var(--text-muted)" }}>
            <Users size={28} className="mx-auto mb-3" style={{ color: "var(--text-dim)" }} />
            <p>You don&apos;t have any friends yet. Search above to add some.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {accepted.map((f) => (
              <FriendRow key={f.friendship_id} friend={f}
                actions={
                  <>
                    <Link href={`/chat?with=${f.other.id}`} className="btn-primary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                      <MessagesSquare size={14} /> Message
                    </Link>
                    <button className="btn-secondary" onClick={() => setPendingRemove(f)}
                            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
                      Remove
                    </button>
                  </>
                } />
            ))}
          </div>
        )}
      </Section>
      </div>

      <ConfirmDialog
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        title={pendingRemove?.status === "pending" ? "Cancel friend request?" : "Remove this friend?"}
        description={pendingRemove?.other.full_name || pendingRemove?.other.email || undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (pendingRemove) performRemove(pendingRemove.friendship_id); }}
      />
    </div>
  );
}

function Section({ title, count, eyebrow, children }: {
  title: string; count: number; eyebrow?: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-end justify-between mb-3">
        <div>
          {eyebrow && (
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {eyebrow}
            </div>
          )}
          <h2 className="font-display text-2xl">{title} <span style={{ color: "var(--text-dim)" }}>({count})</span></h2>
        </div>
      </div>
      {children}
    </div>
  );
}

function SearchResultRow({ r, onSend }: { r: SearchResult; onSend: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="surface px-4 py-3 flex items-center gap-3"
    >
      <Avatar name={r.full_name || r.email || "?"} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{r.full_name || r.email}</div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {r.email && <span>{r.email}</span>}
          {r.share_code && <span style={{ marginLeft: 8 }}>· code <span className="font-mono" style={{ color: "var(--text)" }}>{r.share_code}</span></span>}
        </div>
      </div>
      {r.relationship === "friend" ? (
        <span className="chip chip-active">Already friends</span>
      ) : r.relationship === "request_sent" ? (
        <span className="chip">Request sent</span>
      ) : r.relationship === "request_received" ? (
        <span className="chip">In your inbox</span>
      ) : (
        <button className="btn-primary" onClick={onSend} style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
          <UserPlus size={14} /> Add
        </button>
      )}
    </motion.div>
  );
}

function FriendRow({ friend, actions }: { friend: FriendRow; actions: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="surface px-4 py-3 flex items-center gap-3"
    >
      <Avatar name={friend.other.full_name || friend.other.email || "?"} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {friend.other.full_name || friend.other.email}
        </div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {friend.other.email}
          {friend.other.share_code && (
            <span style={{ marginLeft: 8 }}>· code <span className="font-mono" style={{ color: "var(--text)" }}>{friend.other.share_code}</span></span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </motion.div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name[0]?.toUpperCase() || "?";
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-sm"
      style={{
        width: 38, height: 38,
        background: "var(--surface3)",
        color: "var(--text-muted)",
        border: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}
