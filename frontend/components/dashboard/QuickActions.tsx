import { MessageCircle, Plus, Sparkles } from "lucide-react";
import { ActionCard } from "./ActionCard";

const ACTIONS = [
  {
    href: "/wardrobe",
    icon: <Plus size={18} />,
    title: "Add to closet",
    desc: "Upload a photo or paste a product URL.",
  },
  {
    href: "/studio",
    icon: <Sparkles size={18} />,
    title: "Try on an outfit",
    desc: "Compose a look and see it on your avatar.",
  },
  {
    href: "/stylist",
    icon: <MessageCircle size={18} />,
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
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {ACTIONS.map((a) => (
        <ActionCard key={a.href} href={a.href} icon={a.icon} title={a.title} desc={a.desc} />
      ))}
    </div>
  );
}
