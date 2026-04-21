"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { PhraseSeverity } from "@/lib/competitorPhrasePools";

const CX = 100;
const CY = 100;
const R_OUT = 84;
const R_IN = 56;
const R_NEEDLE = 74;

/**
 * Semicircle dial: green ticks on the left (good), red on the right (bad). The needle is
 * drawn along −Y then `rotate(deg)` is applied. Empirically, **negative** degrees aim toward
 * the green side and **positive** toward the red — map exposure 0→100 across ~180° only.
 */
const NEEDLE_AT_GOOD = -90;
const NEEDLE_AT_BAD = 90;

function clampDeg(d: number): number {
  return Math.max(NEEDLE_AT_GOOD, Math.min(NEEDLE_AT_BAD, d));
}

/** Math angle t: π (left) → 0 (right), upper semicircle. */
function pt(t: number, r: number): [number, number] {
  return [CX + r * Math.cos(t), CY - r * Math.sin(t)];
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Position along arc 0 = left (good) … 1 = right (bad) → RGB for radiating tick. */
function tickColor(u: number): string {
  if (u < 0.14) {
    const t = u / 0.14;
    const r = lerp(52, 190, t * 0.55);
    const g = lerp(211, 254, t * 0.55);
    const b = lerp(153, 52, t * 0.35);
    return `rgb(${r} ${g} ${b})`;
  }
  const stops: [number, number, number][] = [
    [52, 211, 153],
    [251, 191, 36],
    [251, 146, 60],
    [248, 113, 113],
    [239, 68, 68],
  ];
  const u2 = (u - 0.14) / 0.86;
  const seg = u2 * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const t = seg - i;
  const [r1, g1, b1] = stops[i];
  const [r2, g2, b2] = stops[i + 1];
  return `rgb(${lerp(r1, r2, t)} ${lerp(g1, g2, t)} ${lerp(b1, b2, t)})`;
}

function numericExposure(value: number | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Exposure index 0–100 → needle rotation (°). Low = left (good), high = right (bad). */
function valueToDeg(value: number | undefined, severity: PhraseSeverity): number {
  const n = numericExposure(value);
  if (n !== null) {
    const v = Math.max(0, Math.min(100, n));
    return clampDeg(NEEDLE_AT_GOOD + (v / 100) * (NEEDLE_AT_BAD - NEEDLE_AT_GOOD));
  }
  const snap: Record<PhraseSeverity, number> = { low: -72, medium: 0, high: 72 };
  return clampDeg(snap[severity]);
}

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - 2 ** (-12 * t);
}

const DURATION_MS = 1200;
const RADIAL_TICKS = 96;
const INNER_MINOR = 36;

type Props = {
  severity: PhraseSeverity;
  meterValue?: number;
};

export default function RevenueExposureMeter({ severity, meterValue }: Props) {
  const uid = useId().replace(/:/g, "");
  const rimGradId = `gauge-rim-${uid}`;
  const dialShadeId = `gauge-shade-${uid}`;
  const needleGlowId = `needle-glow-${uid}`;

  const targetDeg = valueToDeg(meterValue, severity);
  const [angle, setAngle] = useState(NEEDLE_AT_GOOD);
  /** Last rendered needle angle — kept in sync during RAF so prop changes mid-animation never extrapolate from a stale pivot. */
  const latestAngleRef = useRef(NEEDLE_AT_GOOD);
  const reducedMotionRef = useRef(false);

  const radialLines = useMemo(() => {
    const lines: ReactNode[] = [];
    for (let i = 0; i <= RADIAL_TICKS; i++) {
      const u = i / RADIAL_TICKS;
      const theta = Math.PI * (1 - u);
      const [x1, y1] = pt(theta, R_IN);
      const [x2, y2] = pt(theta, R_OUT);
      const stroke = tickColor(u);
      const w = 0.85 + (i % 3 === 0 ? 0.35 : 0);
      const op = 0.55 + Math.sin(u * Math.PI) * 0.2;
      lines.push(
        <line
          key={`r-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={stroke}
          strokeWidth={w}
          strokeLinecap="butt"
          opacity={op}
        />
      );
    }
    return lines;
  }, []);

  const innerTicks = useMemo(() => {
    const ticks: ReactNode[] = [];
    for (let i = 0; i <= INNER_MINOR; i++) {
      const theta = Math.PI * (1 - i / INNER_MINOR);
      const [x1, y1] = pt(theta, R_IN - 5);
      const [x2, y2] = pt(theta, R_IN - 1);
      ticks.push(
        <line
          key={`m-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={i % 6 === 0 ? 1.1 : 0.65}
          strokeLinecap="round"
        />
      );
    }
    return ticks;
  }, []);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    const from = latestAngleRef.current;
    const to = targetDeg;

    if (reducedMotionRef.current) {
      setAngle(to);
      latestAngleRef.current = to;
      return;
    }

    let start: number | null = null;
    let raf = 0;

    function frame(now: number) {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = easeOutExpo(t);
      const next = clampDeg(from + (to - from) * eased);
      setAngle(next);
      latestAngleRef.current = next;
      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        latestAngleRef.current = to;
      }
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [targetDeg]);

  const labelLow = severity === "low";
  const labelMed = severity === "medium";
  const labelHigh = severity === "high";

  const needleTip =
    severity === "high"
      ? "#ff7b7b"
      : severity === "medium"
        ? "#fde68a"
        : "#d4ff5c";

  const zoneTicks = [Math.PI, (2 * Math.PI) / 3, Math.PI / 3, 0] as const;

  return (
    <div className="mt-4 w-full max-w-[280px] shrink-0">
      <svg
        viewBox="0 0 200 128"
        className="mx-auto block aspect-[200/128] w-full max-h-[168px] overflow-visible"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          meterValue != null && Number.isFinite(meterValue)
            ? Math.round(Math.max(0, Math.min(100, meterValue)))
            : undefined
        }
        aria-label={`Revenue exposure gauge: ${severity}${
          meterValue != null && Number.isFinite(meterValue)
            ? `, ${Math.round(Math.max(0, Math.min(100, meterValue)))}`
            : ""
        }`}
      >
        <defs>
          <linearGradient id={rimGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.07)" />
          </linearGradient>
          <radialGradient id={dialShadeId} cx="50%" cy="100%" r="95%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.45)" />
            <stop offset="55%" stopColor="rgba(0,0,0,0.12)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id={needleGlowId} x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.2" floodColor="#fff" floodOpacity="0.35" />
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>

        {/* Dial floor */}
        <path
          d={`M ${pt(Math.PI, R_OUT + 6)[0]} ${pt(Math.PI, R_OUT + 6)[1]} A ${R_OUT + 6} ${R_OUT + 6} 0 0 1 ${pt(0, R_OUT + 6)[0]} ${pt(0, R_OUT + 6)[1]} L ${CX} ${CY} Z`}
          fill={`url(#${dialShadeId})`}
          opacity={0.9}
        />

        <g style={{ mixBlendMode: "normal" }}>{radialLines}</g>

        {/* Inner scale ring */}
        <path
          d={`M ${pt(Math.PI, R_IN - 6)[0]} ${pt(Math.PI, R_IN - 6)[1]} A ${R_IN - 6} ${R_IN - 6} 0 0 1 ${pt(0, R_IN - 6)[0]} ${pt(0, R_IN - 6)[1]}`}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />
        {innerTicks}

        {/* Zone dividers */}
        {zoneTicks.map((ta, i) => {
          const [x1, y1] = pt(ta, R_IN - 2);
          const [x2, y2] = pt(ta, R_OUT + 4);
          return (
            <line
              key={`z-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Outer rim highlight */}
        <path
          d={`M ${pt(Math.PI, R_OUT + 1)[0]} ${pt(Math.PI, R_OUT + 1)[1]} A ${R_OUT + 1} ${R_OUT + 1} 0 0 1 ${pt(0, R_OUT + 1)[0]} ${pt(0, R_OUT + 1)[1]}`}
          fill="none"
          stroke={`url(#${rimGradId})`}
          strokeWidth={1.25}
          strokeLinecap="round"
          opacity={0.85}
        />

        {/* Hub */}
        <circle cx={CX} cy={CY} r={7} fill="#09090b" stroke="rgba(255,255,255,0.14)" strokeWidth={1.25} />
        <circle cx={CX} cy={CY} r={2.5} fill={needleTip} opacity={0.75} />

        {/* Thin needle */}
        <g transform={`translate(${CX}, ${CY}) rotate(${angle})`}>
          <line
            x1={0}
            y1={1.5}
            x2={0}
            y2={-R_NEEDLE}
            stroke="#f4f4f5"
            strokeWidth={1.15}
            strokeLinecap="butt"
            filter={`url(#${needleGlowId})`}
          />
          <line
            x1={0}
            y1={1.5}
            x2={0}
            y2={-R_NEEDLE}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={0.4}
            strokeLinecap="butt"
            transform="translate(0.35,0)"
          />
          <circle cx={0} cy={-R_NEEDLE} r={2} fill={needleTip} opacity={0.9} />
        </g>
      </svg>

      <div className="mt-2 flex justify-between gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
        <span
          className={
            labelLow ? "text-emerald-400/95 drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]" : "text-zinc-600"
          }
        >
          Low
        </span>
        <span
          className={
            labelMed ? "text-amber-300/95 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]" : "text-zinc-600"
          }
        >
          Medium
        </span>
        <span
          className={
            labelHigh ? "text-red-400/95 drop-shadow-[0_0_10px_rgba(248,113,113,0.4)]" : "text-zinc-600"
          }
        >
          High
        </span>
      </div>
    </div>
  );
}
