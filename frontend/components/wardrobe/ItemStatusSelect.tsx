"use client";

import { useId, useState } from "react";
import { apiPatch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { getItemStatus, ITEM_STATUSES, withStatusTag } from "@/lib/itemStatus";
import type { ItemStatus } from "@/lib/itemStatus";
import type { WardrobeItem } from "@/types";

type Props = {
  item: WardrobeItem;
  onChange: (item: WardrobeItem) => void;
};

export function ItemStatusSelect({ item, onChange }: Props) {
  const id = useId();
  const [isSaving, setIsSaving] = useState(false);
  const status = getItemStatus(item);

  async function handleChange(next: ItemStatus) {
    onChange({ ...item, tags: withStatusTag(item.tags, next) });
    setIsSaving(true);
    try {
      await apiPatch(`/api/wardrobe/${item.id}/status`, { status: next });
    } catch (e) {
      onChange(item);
      toast.error(`Could not update ${item.name}: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <label htmlFor={id} className="sr-only">
        Availability of {item.name}
      </label>
      <select
        id={id}
        value={status}
        disabled={isSaving}
        onChange={(e) => handleChange(e.target.value as ItemStatus)}
        className={`item-status-select ${status === "available" ? "" : "item-status-select--flagged"}`}
      >
        {ITEM_STATUSES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
