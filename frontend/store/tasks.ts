"use client";
/**
 * Active background tasks store.
 *
 * The whole point: when a user clicks Generate in Studio and then navigates
 * to (say) /chat, the React component for Studio unmounts and any local
 * state is lost. We move the in-flight task state HERE - the store outlives
 * any single page, so the fetch completes in the background and the result
 * is waiting when the user comes back to Studio.
 *
 * Browser-tab close still kills the fetch (no service worker), but cross-page
 * nav within the same tab is fully preserved.
 */
import { create } from "zustand";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { useAppStore } from "@/store/app";

export type TaskStatus = "running" | "done" | "error";
export type TaskKind = "tryon" | "event" | "animate" | "avatar_still" | "avatar_video";

interface BaseTask {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  errorStatus?: number;
  label: string;
}

export interface TryOnTask extends BaseTask {
  kind: "tryon";
  // Inputs (so Studio can show what's being made even after a refresh)
  itemNames: string[];
  itemImageUrls: string[];
  setting?: string;
  quality: "standard" | "pro";
  // Outputs
  resultUrl?: string;
  resultId?: string;
  nobgUrl?: string;
  // Derived
  eventUrl?: string;
  videoUrl?: string;
}

export interface EventTask extends BaseTask {
  kind: "event";
  parentTaskId: string;       // in-memory task id of parent tryon
  parentTryOnDbId?: string;
  context: string;
  resultUrl?: string;
}

export interface AnimateTask extends BaseTask {
  kind: "animate";
  parentTaskId?: string;
  parentTryOnDbId?: string;
  sourceUrl: string;
  videoUrl?: string;
}

// Selfie-driven avatar pipeline jobs (stylized hero still / ramp-walk video).
// These run entirely server-side (kicked off on selfie upload or an explicit
// refresh) with no page keeping local state, so they're tracked here purely
// so Activity has something to show — the source of truth for the resulting
// URL/status still lives in useAppStore (read by the Dashboard hero + Studio).
export interface AvatarTask extends BaseTask {
  kind: "avatar_still" | "avatar_video";
  resultUrl?: string;
}

type Task = TryOnTask | EventTask | AnimateTask | AvatarTask;

interface State {
  tasks: Task[];
  startTryOn: (input: {
    items: { id: string; name: string; image_url: string; category: string }[];
    avatarSelfieUrl: string;
    setting?: string;
    quality: "standard" | "pro";
    model?: string;   // explicit try-on model id; overrides quality mapping
    enhancePrompt?: boolean;  // AI-enhance the setting via the prompt graph
    referenceSelfieUrls?: string[];  // extra selfie refs (Gemini identity)
  }) => string;
  startEventScene: (input: {
    parentTaskId: string;       // in-memory store task id (NOT DB id)
    parentTryOnDbId?: string;   // DB id, sent to backend so it can persist event_scene_url
    tryOnImageUrl: string;
    context: string;
  }) => string;
  startAnimate: (input: {
    sourceUrl: string;
    parentTaskId?: string;       // in-memory store task id
    parentTryOnDbId?: string;    // DB id for backend persistence
    model?: string;              // video model id
    motionPrompt?: string;       // user-chosen motion description
    scene?: string;              // optional scene/background hint
    enhancePrompt?: boolean;     // AI-enhance the motion/scene via the prompt graph
  }) => string;
  cancelTryOn: () => void;
  clearDone: () => void;
  remove: (id: string) => void;
  // Starts polling if no watch of that kind is already running; no-op otherwise.
  watchAvatarStill: () => string;
  watchAvatarVideo: () => string;
}

const newId = () => Math.random().toString(36).slice(2, 10);

function update<T extends Task>(set: (fn: (s: State) => Partial<State>) => void, id: string, patch: Partial<T>) {
  set((s) => ({
    tasks: s.tasks.map((t) => (t.id === id ? ({ ...t, ...patch } as Task) : t)),
  }));
}

export const useTasks = create<State>((set, get) => ({
  tasks: [],

  startTryOn(input) {
    const id = newId();
    const task: TryOnTask = {
      id, kind: "tryon", status: "running", startedAt: Date.now(),
      label: input.items.map((i) => i.name).join(" + ") || "Try-on",
      itemNames: input.items.map((i) => i.name),
      itemImageUrls: input.items.map((i) => i.image_url),
      setting: input.setting,
      quality: input.quality,
    };
    set((s) => ({ tasks: [...s.tasks.filter((t) => t.kind !== "tryon" || t.status !== "running"), task] }));

    const model = input.model ?? (input.quality === "pro" ? "gen4_image" : "gen4_image_turbo");
    const setting = input.setting?.trim() || undefined;
    const promise = input.items.length === 1
      ? apiPost<{ result_image_url: string; result_id: string; result_nobg_url?: string }>("/api/tryon/generate", {
          wardrobe_item_id: input.items[0].id,
          item_image_url: input.items[0].image_url,
          avatar_selfie_url: input.avatarSelfieUrl,
          item_name: input.items[0].name,
          item_category: input.items[0].category,
          model, setting,
          enhance_prompt: input.enhancePrompt,
          reference_selfie_urls: input.referenceSelfieUrls,
        })
      : apiPost<{ result_image_url: string; result_id: string; result_nobg_url?: string }>("/api/tryon/generate-multi", {
          avatar_selfie_url: input.avatarSelfieUrl,
          items: input.items.map((i) => ({ image_url: i.image_url, name: i.name, category: i.category })),
          model, setting,
          enhance_prompt: input.enhancePrompt,
          reference_selfie_urls: input.referenceSelfieUrls,
        });

    promise
      .then((res) => {
        // Dropped if the user cancelled (task removed from the store).
        if (!get().tasks.some((t) => t.id === id)) return;
        update<TryOnTask>(set, id, {
          status: "done",
          finishedAt: Date.now(),
          resultUrl: res.result_image_url,
          resultId: res.result_id,
          nobgUrl: res.result_nobg_url ?? undefined,
        });
        toast.success(`Try-on ready: ${task.label.slice(0, 40)}`);
      })
      .catch((e) => {
        if (!get().tasks.some((t) => t.id === id)) return;
        const msg = e instanceof Error ? e.message : String(e);
        const errorStatus = e instanceof ApiError ? e.status : undefined;
        update<TryOnTask>(set, id, { status: "error", finishedAt: Date.now(), error: msg, errorStatus });
        toast.error(`Try-on failed: ${msg.slice(0, 80)}`);
      });

    return id;
  },

  startEventScene(input) {
    const id = newId();
    const task: EventTask = {
      id, kind: "event", status: "running", startedAt: Date.now(),
      label: `Event: ${input.context}`,
      parentTaskId: input.parentTaskId,
      parentTryOnDbId: input.parentTryOnDbId,
      context: input.context,
    };
    set((s) => ({ tasks: [...s.tasks, task] }));

    apiPost<{ event_image_url: string }>("/api/tryon/event-scene", {
      tryon_result_url: input.tryOnImageUrl,
      event_context: input.context,
      tryon_result_id: input.parentTryOnDbId,
    })
      .then((res) => {
        update<EventTask>(set, id, {
          status: "done", finishedAt: Date.now(), resultUrl: res.event_image_url,
        });
        // Patch the parent try-on (in-memory) so eventUrl appears inline
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === input.parentTaskId && t.kind === "tryon"
              ? ({ ...t, eventUrl: res.event_image_url } as TryOnTask)
              : t
          ),
        }));
        toast.success(`Placed in scene: ${input.context.slice(0, 40)}`);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        update<EventTask>(set, id, { status: "error", finishedAt: Date.now(), error: msg });
        toast.error(`Event scene failed: ${msg.slice(0, 80)}`);
      });

    return id;
  },

  startAnimate(input) {
    const id = newId();
    const task: AnimateTask = {
      id, kind: "animate", status: "running", startedAt: Date.now(),
      label: "Animate (5s)",
      sourceUrl: input.sourceUrl,
      parentTaskId: input.parentTaskId,
      parentTryOnDbId: input.parentTryOnDbId,
    };
    set((s) => ({ tasks: [...s.tasks, task] }));

    apiPost<{ video_url: string }>("/api/tryon/animate", {
      image_url: input.sourceUrl,
      tryon_result_id: input.parentTryOnDbId,
      model: input.model,
      motion_prompt: input.motionPrompt,
      scene: input.scene,
      enhance_prompt: input.enhancePrompt,
    })
      .then((res) => {
        update<AnimateTask>(set, id, {
          status: "done", finishedAt: Date.now(), videoUrl: res.video_url,
        });
        if (input.parentTaskId) {
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === input.parentTaskId && t.kind === "tryon"
                ? ({ ...t, videoUrl: res.video_url } as TryOnTask)
                : t
            ),
          }));
        }
        toast.success("Video ready!");
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        update<AnimateTask>(set, id, { status: "error", finishedAt: Date.now(), error: msg });
        toast.error(`Animation failed: ${msg.slice(0, 80)}`);
      });

    return id;
  },

  watchAvatarStill() {
    const running = get().tasks.find((t) => t.kind === "avatar_still" && t.status === "running");
    if (running) return running.id;

    const id = newId();
    const task: AvatarTask = { id, kind: "avatar_still", status: "running", startedAt: Date.now(), label: "Stylized avatar" };
    set((s) => ({ tasks: [...s.tasks, task] }));

    let attempts = 0;
    const tick = async () => {
      attempts++;
      try {
        const d = await apiGet<{ url: string | null; status: string }>("/api/avatar/stylized");
        useAppStore.getState().setStylized(d.url, d.status as never);
        if (d.status === "ready") {
          update<AvatarTask>(set, id, { status: "done", finishedAt: Date.now(), resultUrl: d.url ?? undefined });
          toast.success("Your stylized avatar is ready!");
        } else if (d.status === "failed") {
          update<AvatarTask>(set, id, { status: "error", finishedAt: Date.now(), error: "Generation failed." });
          toast.error("Stylized avatar generation failed.");
        } else if (d.status === "generating" || (d.status !== "ready" && attempts < 4)) {
          // "idle"/"no_selfie" in the first few ticks can just mean the
          // background job hasn't flipped the DB row yet — keep polling briefly.
          if (attempts < 90) setTimeout(tick, d.status === "generating" ? 5000 : 1500);
          else update<AvatarTask>(set, id, { status: "error", finishedAt: Date.now(), error: "Timed out." });
        } else {
          // Confirmed nothing is actually running — drop the task quietly.
          set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
        }
      } catch {
        if (attempts < 90) setTimeout(tick, 8000);
      }
    };
    tick();
    return id;
  },

  watchAvatarVideo() {
    const running = get().tasks.find((t) => t.kind === "avatar_video" && t.status === "running");
    if (running) return running.id;

    const id = newId();
    const task: AvatarTask = { id, kind: "avatar_video", status: "running", startedAt: Date.now(), label: "Ramp-walk video" };
    set((s) => ({ tasks: [...s.tasks, task] }));

    let attempts = 0;
    const tick = async () => {
      attempts++;
      try {
        const d = await apiGet<{ url: string | null; status: string }>("/api/avatar/stylized-video");
        useAppStore.getState().setStylizedVideo(d.url, d.status as never);
        if (d.status === "ready") {
          update<AvatarTask>(set, id, { status: "done", finishedAt: Date.now(), resultUrl: d.url ?? undefined });
          toast.success("Your ramp-walk video is ready!");
        } else if (d.status === "failed") {
          update<AvatarTask>(set, id, { status: "error", finishedAt: Date.now(), error: "Generation failed." });
          toast.error("Ramp video generation failed.");
        } else if (d.status === "generating" || (d.status !== "ready" && attempts < 4)) {
          if (attempts < 90) setTimeout(tick, d.status === "generating" ? 5000 : 1500);
          else update<AvatarTask>(set, id, { status: "error", finishedAt: Date.now(), error: "Timed out." });
        } else {
          set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
        }
      } catch {
        if (attempts < 90) setTimeout(tick, 8000);
      }
    };
    tick();
    return id;
  },

  cancelTryOn() {
    // Drop the running try-on so the UI returns to idle. The in-flight fetch
    // still resolves server-side, but its handler no-ops (task is gone).
    set((s) => ({ tasks: s.tasks.filter((t) => !(t.kind === "tryon" && t.status === "running")) }));
  },

  clearDone() {
    set((s) => ({ tasks: s.tasks.filter((t) => t.status === "running") }));
  },

  remove(id) {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },
}));

// Convenience selectors
export const selectActiveTryOn = (s: State): TryOnTask | undefined =>
  [...s.tasks].reverse().find((t) => t.kind === "tryon") as TryOnTask | undefined;
export const selectRunningCount = (s: State): number =>
  s.tasks.filter((t) => t.status === "running").length;
