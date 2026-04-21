"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Sealing your business profile…",
  "Mapping Core Web Vitals to revenue risk…",
  "Running funnel-aware impact engine…",
  "Applying sensitivity bands…",
  "Synthesizing opportunity range…",
];

export function RevenueCalculationProgress({ active }: { active: boolean }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  useEffect(() => {
    if (!active || reducedMotion) return;
    const id = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % STEPS.length);
    }, 820);
    return () => window.clearInterval(id);
  }, [active, reducedMotion]);

  useEffect(() => {
    if (!active) setStepIndex(0);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="relative mt-4 overflow-hidden rounded-2xl border border-[#befe34]/20 bg-[#0a0a0a]/80 p-5 shadow-[0_0_40px_-12px_rgba(190,254,52,0.25)]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `linear-gradient(rgba(190,254,52,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(190,254,52,0.04) 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
        }}
      />
      <div className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-[#befe34]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 left-1/4 h-32 w-48 rounded-full bg-red-500/5 blur-3xl" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative mx-auto h-14 w-14 shrink-0 sm:mx-0">
          <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle
              className={reducedMotion ? "" : "revenue-calc-ring"}
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#befe34"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="97"
              strokeDashoffset="72"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`h-2 w-2 rounded-full bg-[#befe34] shadow-[0_0_10px_rgba(190,254,52,0.85)] ${reducedMotion ? "" : "revenue-calc-dot-pulse"}`}
              aria-hidden
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#befe34]/90">Live simulation</p>
          <p className="mt-1.5 min-h-[2.75rem] text-sm font-medium leading-snug text-zinc-100 transition-opacity duration-300">
            {STEPS[stepIndex]}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Correlating your inputs with the latest performance snapshot — this usually takes a moment.
          </p>
        </div>
      </div>

      <div className="relative mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full w-[42%] rounded-full bg-gradient-to-r from-transparent via-[#befe34]/90 to-transparent ${
            reducedMotion ? "mx-auto opacity-80" : "revenue-calc-shimmer-bar"
          }`}
        />
      </div>
    </div>
  );
}
