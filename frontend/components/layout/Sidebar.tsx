"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Settings, Bell, Shirt, Layers, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useTasks } from "@/store/tasks";
import { apiGet } from "@/lib/api";
import { FEATURES } from "@/lib/features";

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ isOpen = true, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [pendingFriends, setPendingFriends] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const finishedTaskCount = useTasks((s) => s.tasks.filter((t) => t.status !== "running").length);

  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    let mounted = true;
    const client = getSupabaseBrowser();

    async function load() {
      const friendsRes = await client.from("friendships").select("id", { count: "exact", head: true })
        .eq("addressee_id", uid).eq("status", "pending");
      if (!mounted) return;
      setPendingFriends(friendsRes.count ?? 0);
    }
    load();

    apiGet<{ unread: number }[]>("/api/chat/threads")
      .then((threads) => { if (mounted) setUnreadMessages(threads.reduce((sum, t) => sum + (t.unread || 0), 0)); })
      .catch(() => {});

    // React Strict Mode / HMR can remount before cleanup finishes; Supabase reuses
    // an already-subscribed channel for the same topic, and .on() then throws.
    const topic = `sidebar:${uid}`;
    client.getChannels()
      .filter((ch: RealtimeChannel) => ch.topic === `realtime:${topic}`)
      .forEach((ch: RealtimeChannel) => client.removeChannel(ch));

    const channel = client
      .channel(topic)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "friendships", filter: `addressee_id=eq.${uid}` },
        () => setPendingFriends((n) => n + 1))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${uid}` },
        () => setUnreadMessages((n) => n + 1))
      .subscribe();

    return () => {
      mounted = false;
      client.removeChannel(channel);
    };
  }, [user?.id]);

  const navItems = [
    { href: "/wardrobe", icon: Shirt,         label: "Wardrobe", badge: 0                },
    { href: "/outfits",  icon: Layers,        label: "Outfits",  badge: 0                },
    ...(FEATURES.social ? [
      { href: "/chat",     icon: MessageCircle, label: "Chat",     badge: unreadMessages   },
    ] : []),
    { href: "/activity", icon: Bell,          label: "Activity", badge: finishedTaskCount },
    ...(FEATURES.social ? [
      { href: "/friends",  icon: Users,         label: "Friends",  badge: pendingFriends    },
    ] : []),
  ];

  // Collapsed strip — just the chevron to re-open
  if (!isOpen) {
    return (
      <aside
        className="hidden md:flex flex-col items-center py-4 shrink-0 border-r-2"
        style={{ width: 32, borderColor: "var(--ink)", background: "var(--bg)" }}
      >
        <button
          onClick={onToggle}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="flex items-center justify-center rounded-lg transition-colors"
          style={{ width: 28, height: 44, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
        >
          <ChevronRight size={14} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="hidden md:flex flex-col items-center py-4 shrink-0 border-r-2"
      style={{ width: 64, borderColor: "var(--ink)", background: "var(--bg)" }}
    >
      {/* Collapse button */}
      <button
        onClick={onToggle}
        title="Collapse sidebar"
        aria-label="Collapse sidebar"
        className="flex items-center justify-center rounded-lg transition-colors mb-2"
        style={{ width: 44, height: 36, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
      >
        <ChevronLeft size={14} />
      </button>

      <nav aria-label="Sections" className="flex flex-col items-center gap-1 flex-1 w-full px-2">
        {navItems.map(({ href, icon: Icon, label, badge }) => {
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              className="w-full flex items-center justify-center rounded-lg transition-colors relative"
              style={{
                height: 44,
                color: active ? "#ffffff" : "var(--text-muted)",
                background: active ? "var(--ink)" : "transparent",
                textDecoration: "none",
              }}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {badge > 0 && (
                <span
                  className="absolute top-1 right-1 text-2xs font-semibold px-1 rounded-full"
                  style={{ background: "var(--ink)", color: "var(--parchment)", minWidth: 16, textAlign: "center" }}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="w-full px-2">
        <Link
          href="/settings"
          title="Settings"
          aria-label="Settings"
          className="w-full flex items-center justify-center rounded-lg transition-colors"
          style={{
            height: 44,
            color: pathname === "/settings" ? "#ffffff" : "var(--text-muted)",
            background: pathname === "/settings" ? "var(--ink)" : "transparent",
            textDecoration: "none",
          }}
        >
          <Settings className="w-5 h-5 shrink-0" />
        </Link>
      </div>
    </aside>
  );
}
