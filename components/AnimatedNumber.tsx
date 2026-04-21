"use client";

import { useEffect, useState } from "react";

const DURATION_MS = 600;

export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration = DURATION_MS,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const [prev, setPrev] = useState(0);

  useEffect(() => {
    if (value === prev) return;
    const start = performance.now();
    const startVal = prev;
    const diff = value - startVal;
    const step = (t: number) => {
      const elapsed = t - start;
      const p = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - p) * (1 - p);
      setDisplay(startVal + diff * eased);
      if (p < 1) requestAnimationFrame(step);
      else setPrev(value);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [value, duration, prev]);

  return <span className="tabular-nums">{format(display)}</span>;
}

export function AnimatedProgressBar({
  value,
  className = "",
  barClassName = "",
  duration = 800,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  duration?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-white/10 ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full bg-white/50 ${barClassName}`}
        style={{
          width: `${width}%`,
          transition: `width ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      />
    </div>
  );
}
