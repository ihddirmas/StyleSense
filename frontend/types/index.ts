export interface WardrobeItem {
  id: string;
  user_id: string;
  name: string;
  category: "tops" | "bottoms" | "dresses" | "outerwear" | "shoes" | "accessories";
  occasion?: "casual" | "formal" | "evening" | "sport" | "beach" | "any";
  color?: string | null;
  brand?: string | null;
  tags: string[];
  image_url: string;
  cutout_url?: string | null;
  source_url?: string | null;
  created_at: string;
}

export interface TryOnResult {
  id: string;
  user_id: string;
  wardrobe_item_id: string | null;
  result_image_url: string;
  result_video_url: string | null;
  b2_image_url?: string | null;
  image_manifest_hash?: string | null;
  b2_video_url?: string | null;
  video_manifest_hash?: string | null;
  event_scene_url: string | null;
  event_context: string | null;
  prompt_used: string | null;
  model_used: string | null;
  status: "pending" | "processing" | "done" | "failed";
  created_at: string;
}

export interface Outfit {
  id: string;
  user_id: string;
  name: string;
  item_ids: string[];
  occasion: string | null;
  preview_image_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface PendingAction {
  toolName: string;
  toolUseId: string;
  summary: string;
  costCredits?: number | null;
  status: "pending" | "confirmed" | "cancelled";
}

export interface ProductPreview {
  imageUrl: string;
  name: string;
  sourceUrl: string;
  suggestedCategory?: string | null;
}

export interface CapsulePlan {
  destination: string;
  days: number;
  dress_code: string;
  daily_outfits?: Array<{
    day?: number;
    label?: string;
    items?: Array<{ id: string; name: string; category?: string }>;
    notes?: string;
  }>;
  gaps?: Array<{ category?: string; description?: string; suggestion?: string; why?: string }>;
  packing_notes?: string[];
  coverage_pct?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  suggestedItemIds?: string[];
  scene?: string | null;      // try-on background for "Manifest this look"
  manifesting?: boolean;      // an inline try-on is generating
  manifestUrl?: string;       // the generated look, shown inline in the bubble
  photoUrl?: string;          // user-uploaded photo shown in their chat bubble
  manifestId?: string;        // the try-on result id (to save it as an outfit)
  savedOutfit?: boolean;      // this manifested look was saved to Outfits
  pendingAction?: PendingAction; // a tool call Aria proposed, awaiting confirm/cancel
  productPreview?: ProductPreview; // a link Aria looked up via lookup_product_from_url
  capsulePlan?: CapsulePlan;
  feedbackRating?: "up" | "down";
}

export interface DetectedItem {
  name: string;
  category: WardrobeItem["category"];
  color?: string | null;
  brand?: string | null;
  occasion?: WardrobeItem["occasion"];
  position?: string | null;
}

export interface StylistWardrobeDetectResponse {
  detected: DetectedItem[];
  image_url: string;
}

export interface StylistWardrobeConfirmResponse {
  created: WardrobeItem[];
  failed: Array<{ name: string; reason: string }>;
  summary: string;
}
