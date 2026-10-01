export interface WardrobeItem {
  id: string;
  user_id: string;
  name: string;
  category: string;
  color?: string | null;
  brand?: string | null;
  tags?: string[];
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
  status: string;
  created_at: string;
}

export interface UsageStatus {
  tryon: { used: number; limit: number };
  event_scene?: { used: number; limit: number };
  animate?: { used: number; limit: number };
  plan?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
