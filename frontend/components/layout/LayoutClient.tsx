"use client";
import { useState, useEffect } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAppStore } from "@/store/app";
import { useAriaChat } from "@/store/ariaChat";

export function LayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => {
      useAppStore.setState({ hydrated: true });
    });
    useAppStore.persist.rehydrate();
    useAriaChat.persist.rehydrate();
    return unsub;
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 min-h-0 overflow-hidden px-4 pt-4 sm:px-8 sm:pt-6">{children}</main>
      </div>
    </div>
  );
}
