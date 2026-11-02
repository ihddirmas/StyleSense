import type { WardrobeItem } from "@/types";

export const ITEM_STATUSES = [
  { value: "available", label: "Ready to wear" },
  { value: "laundry", label: "In the laundry" },
  { value: "needs_iron", label: "Needs ironing" },
  { value: "stain", label: "Has a stain" },
  { value: "repair", label: "Needs repair" },
  { value: "lent", label: "Lent out" },
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number]["value"];

const STATUS_PREFIX = "status:";

export function getItemStatus(item: Pick<WardrobeItem, "tags">): ItemStatus {
  const tag = (item.tags ?? []).find((t) => t.toLowerCase().startsWith(STATUS_PREFIX));
  const value = tag?.slice(STATUS_PREFIX.length).toLowerCase();
  return ITEM_STATUSES.find((s) => s.value === value)?.value ?? "available";
}

export function withStatusTag(tags: string[] | undefined, status: ItemStatus): string[] {
  const rest = (tags ?? []).filter((t) => !t.toLowerCase().startsWith(STATUS_PREFIX));
  return status === "available" ? rest : [...rest, `${STATUS_PREFIX}${status}`];
}

// Needs-ironing still counts as wearable; it only costs time.
export function isUnavailable(item: Pick<WardrobeItem, "tags">): boolean {
  const status = getItemStatus(item);
  return status !== "available" && status !== "needs_iron";
}
