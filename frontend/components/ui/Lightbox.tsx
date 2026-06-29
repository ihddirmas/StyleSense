"use client";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface LightboxProps {
  url: string | null;
  onClose: () => void;
  zIndex?: number;
}

export function Lightbox({ url, onClose, zIndex = 200 }: LightboxProps) {
  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(8,8,13,0.92)", zIndex }}
          onClick={onClose}
        >
          <button
            onClick={onClose}
            style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}
            aria-label="Close"
          >
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Preview"
            style={{ maxHeight: "88vh", maxWidth: "90vw", objectFit: "contain" }}
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
