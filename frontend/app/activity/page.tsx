"use client";
import type { ReactNode } from "react";
import { Loader2, CheckCircle2, XCircle, Trash2, X, Clapperboard, Sparkles, ImageIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTasks } from "@/store/tasks";
import type { TaskKind, TaskStatus, TryOnTask, EventTask, AnimateTask } from "@/store/tasks";

type AnyTask = TryOnTask | EventTask | AnimateTask;

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

const KIND_LABELS: Record<TaskKind, string> = {
  tryon: "TRY-ON",
  event: "SCENE",
  animate: "VIDEO",
};

const KIND_ICONS: Record<TaskKind, ReactNode> = {
  tryon: <Sparkles size={10} />,
  event: <ImageIcon size={10} />,
  animate: <Clapperboard size={10} />,
};

function thumbUrl(task: AnyTask): string | undefined {
  if (task.kind === "tryon") return (task as TryOnTask).resultUrl ?? (task as TryOnTask).itemImageUrls?.[0];
  if (task.kind === "event") return (task as EventTask).resultUrl;
  if (task.kind === "animate") return (task as AnimateTask).sourceUrl;
  return undefined;
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "running") return <Loader2 size={16} className="spin" style={{ color: "var(--gold)" }} />;
  if (status === "done")    return <CheckCircle2 size={16} style={{ color: "var(--green)" }} />;
  return <XCircle size={16} style={{ color: "var(--red)" }} />;
}

export default function ActivityPage() {
  const tasks = [...useTasks((s) => s.tasks)].reverse();
  const clearDone = useTasks((s) => s.clearDone);
  const remove = useTasks((s) => s.remove);

  const doneCount = tasks.filter((t) => t.status !== "running").length;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0">
        <PageHeader
          eyebrow="Background tasks"
          tutorialKey="activity"
          subtitle="All try-ons, scenes, and animations started this session. History resets on page reload."
          action={
            doneCount > 0 ? (
              <button
                className="btn-secondary whitespace-nowrap"
                style={{ padding: "0.4rem 0.9rem" }}
                onClick={clearDone}
              >
                <Trash2 size={13} /> Clear done
              </button>
            ) : undefined
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-16">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center" style={{ color: "var(--text-dim)" }}>
            <Sparkles size={32} className="mb-4" style={{ opacity: 0.35 }} />
            <div className="text-sm">No activity yet this session.</div>
            <div className="text-xs mt-1">Generate a try-on in Studio to see it here.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-2xl">
            {tasks.map((task) => {
              const thumb = thumbUrl(task);
              return (
                <div
                  key={task.id}
                  className="surface flex items-center gap-3 p-3"
                  style={{ opacity: task.status === "error" ? 0.75 : 1 }}
                >
                  {/* Thumbnail */}
                  <div
                    className="shrink-0 overflow-hidden"
                    style={{ width: 44, height: 44, background: "var(--surface2)", border: "1px solid var(--border)" }}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--text-dim)" }}>
                        <Sparkles size={16} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="shrink-0 flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.5"
                        style={{ background: "var(--surface3)", color: "var(--text-muted)", letterSpacing: "0.08em" }}
                      >
                        {KIND_ICONS[task.kind]}
                        {KIND_LABELS[task.kind]}
                      </span>
                      <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
                        {task.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
                      <StatusIcon status={task.status} />
                      <span>
                        {task.status === "running" && "Running…"}
                        {task.status === "done" && `Done${task.finishedAt ? ` · ${timeAgo(task.finishedAt)}` : ""}`}
                        {task.status === "error" && `Failed${task.finishedAt ? ` · ${timeAgo(task.finishedAt)}` : ""}`}
                      </span>
                    </div>
                    {task.status === "error" && task.error && (
                      <div className="text-xs mt-1 truncate" style={{ color: "var(--red)" }}>
                        {task.error}
                      </div>
                    )}
                  </div>

                  {/* Dismiss */}
                  {task.status !== "running" && (
                    <button
                      onClick={() => remove(task.id)}
                      className="shrink-0 flex items-center justify-center"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4 }}
                      aria-label="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
