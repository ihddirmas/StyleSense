import { MessageCircle, Plus, Sparkles } from "lucide-react";
import { ActionCard } from "./ActionCard";

const ACTIONS = [
  {
    href: "/wardrobe",
    icon: <Plus size={18} strokeWidth={2} />,
    title: "Add to closet",
    desc: "Upload a photo or paste a product URL.",
  },
  {
    href: "/studio",
    icon: <Sparkles size={18} strokeWidth={2} />,
    title: "Try on an outfit",
    desc: "Compose a look and see it on your avatar.",
  },
  {
    href: "/stylist",
    icon: <MessageCircle size={18} strokeWidth={2} />,
    title: "Ask your stylist",
    desc: "Get item picks for your next event.",
  },
] as const;

export function QuickActions({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {ACTIONS.map((a) => (
          <ActionCard key={a.href} href={a.href} icon={a.icon} title={a.title} compact />
        ))}
      </div>
    );
  }

  return (
    <div className="quick-actions-grid">
      {ACTIONS.map((a) => (
        <ActionCard key={a.href} href={a.href} icon={a.icon} title={a.title} desc={a.desc} />
      ))}
    </div>
  );
}
