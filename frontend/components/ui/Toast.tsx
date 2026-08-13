"use client";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useToastStore, toast } from "@/store/toast";

export { toast };
export type { Toast, ToastKind } from "@/store/toast";

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      className="fixed top-4 right-4 flex flex-col gap-2"
      style={{ zIndex: 9999, maxWidth: 400 }}
    >
      <AnimatePresence>
        {toasts.map((t) => {
          const color = t.kind === "success" ? "var(--green)"
                      : t.kind === "error"   ? "var(--red)"
                                             : "var(--gold)";
          const Icon = t.kind === "success" ? CheckCircle2
                     : t.kind === "error"   ? AlertCircle
                                            : Info;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 30, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 30, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="surface flex items-start gap-3 px-4 py-3"
              style={{ borderColor: color, minWidth: 280 }}
            >
              <Icon size={18} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="flex-1 text-sm" style={{ color: "var(--text)" }}>{t.message}</div>
              <button
                onClick={() => dismiss(t.id)}
                style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
