"use client";

const CAPABILITIES = [
  "Outfit picks from your closet",
  "Try-on previews",
  "Add items from photos",
  "Product URL lookup",
] as const;

export function AgentCapabilities() {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="What Aria can do">
      {CAPABILITIES.map((label) => (
        <span key={label} className="agent-capability-pill">
          {label}
        </span>
      ))}
    </div>
  );
}
