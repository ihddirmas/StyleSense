"use client";
import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface Motif {
  id: string;
  x: string;
  y: string;
  depth: number;
  opacity: number;
  size: number;
  rotate: number;
  floatDuration: number;
  floatAmp: number;
  svg: React.ReactNode;
}

const MOTIFS: Motif[] = [
  {
    id: "dress",
    x: "8%", y: "18%",
    depth: 0.06, opacity: 0.28, size: 80, rotate: -8, floatDuration: 6, floatAmp: 14,
    svg: (
      <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 8 C20 8 15 14 10 18 L5 32 L20 28 L20 72 L40 72 L40 28 L55 32 L50 18 C45 14 40 8 40 8 C37 12 30 14 20 8Z"
          stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
        <path d="M20 8 C23 5 37 5 40 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    ),
  },
  {
    id: "hanger",
    x: "84%", y: "12%",
    depth: 0.04, opacity: 0.25, size: 72, rotate: 5, floatDuration: 8, floatAmp: 10,
    svg: (
      <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M40 8 C40 8 44 8 44 12 C44 16 40 16 40 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M40 16 L10 42 Q8 44 8 46 Q8 50 40 50 Q72 50 72 46 Q72 44 70 42 L40 16Z"
          stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "leaf",
    x: "6%", y: "70%",
    depth: 0.08, opacity: 0.30, size: 65, rotate: 20, floatDuration: 5, floatAmp: 18,
    svg: (
      <svg viewBox="0 0 50 70" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M25 65 C25 65 5 50 5 30 C5 10 15 5 25 5 C35 5 45 10 45 30 C45 50 25 65 25 65Z"
          stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M25 65 L25 5" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
        <path d="M25 40 Q15 35 8 38" stroke="currentColor" strokeWidth="1" fill="none" />
        <path d="M25 28 Q35 23 42 26" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
    ),
  },
  {
    id: "perfume",
    x: "90%", y: "58%",
    depth: 0.05, opacity: 0.26, size: 55, rotate: -5, floatDuration: 7, floatAmp: 12,
    svg: (
      <svg viewBox="0 0 40 70" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="12" y="20" width="16" height="44" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <rect x="16" y="14" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="14" y="10" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <line x1="20" y1="5" x2="20" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="16" y1="5" x2="24" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="15" y1="35" x2="25" y2="35" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        <line x1="15" y1="45" x2="25" y2="45" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: "ribbon",
    x: "60%", y: "7%",
    depth: 0.03, opacity: 0.22, size: 90, rotate: 12, floatDuration: 9, floatAmp: 8,
    svg: (
      <svg viewBox="0 0 80 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 20 C20 5 35 35 50 20 C65 5 75 30 75 20"
          stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M5 28 C20 13 35 43 50 28 C65 13 75 38 75 28"
          stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
  },
  {
    id: "scissors",
    x: "80%", y: "80%",
    depth: 0.07, opacity: 0.24, size: 58, rotate: -30, floatDuration: 6.5, floatAmp: 16,
    svg: (
      <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="14" r="8" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="46" r="8" stroke="currentColor" strokeWidth="1.5" />
        <line x1="20" y1="20" x2="54" y2="54" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="20" y1="40" x2="54" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "gem",
    x: "28%", y: "88%",
    depth: 0.05, opacity: 0.28, size: 42, rotate: 0, floatDuration: 7.5, floatAmp: 11,
    svg: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 4 L36 16 L20 36 L4 16 Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M4 16 L20 22 L36 16" stroke="currentColor" strokeWidth="1" fill="none" />
        <path d="M13 4 L20 22 L27 4" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
    ),
  },
];

function MotifElement({
  motif,
  mouseX,
  mouseY,
}: {
  motif: Motif;
  mouseX: ReturnType<typeof useMotionValue<number>>;
  mouseY: ReturnType<typeof useMotionValue<number>>;
}) {
  const springConfig = { stiffness: 80, damping: 22, mass: 1 };

  const rawX = useTransform(mouseX, (v) => v * motif.depth);
  const rawY = useTransform(mouseY, (v) => v * motif.depth);
  const x = useSpring(rawX, springConfig);
  const y = useSpring(rawY, springConfig);

  const a = motif.floatAmp;

  return (
    <motion.div
      style={{
        position: "absolute",
        left: motif.x,
        top: motif.y,
        width: motif.size,
        height: motif.size,
        color: "var(--ink)",
        opacity: motif.opacity,
        rotate: motif.rotate,
        translateX: "-50%",
        translateY: "-50%",
        x,
        y,
      }}
    >
      <motion.div
        animate={{
          y: [0, -a, 0, a * 0.6, 0],
          rotate: [-2, 2, -1, 3, -2],
        }}
        transition={{
          duration: motif.floatDuration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ width: "100%", height: "100%" }}
      >
        {motif.svg}
      </motion.div>
    </motion.div>
  );
}

export function FashionBackground() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX - window.innerWidth / 2);
      mouseY.set(e.clientY - window.innerHeight / 2);
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {MOTIFS.map((motif) => (
        <MotifElement key={motif.id} motif={motif} mouseX={mouseX} mouseY={mouseY} />
      ))}
    </div>
  );
}
