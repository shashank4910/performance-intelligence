"use client";

import { AnimatedProgressBar } from "@/components/AnimatedNumber";
import {
  analysisFreshnessCaption,
  websiteHealthInterpretationLine,
} from "@/lib/dashboardWebsiteHealthCopy";

function heroHealthColor(score0to100: number) {
  return score0to100 >= 80 ? "text-emerald-400" : score0to100 >= 50 ? "text-amber-400" : "text-red-400";
}

function healthScoreBarClass(score0to100: number) {
  if (score0to100 >= 80) return "bg-emerald-400";
  if (score0to100 >= 50) return "bg-amber-400";
  return "bg-red-500";
}

export type WebsiteHealthCardProps = {
  surfaceClassName: string;
  healthScore100: number;
  analyzedAt: string | undefined | null;
  /** Tighter hero when dashboard is in first-visit decision mode. */
  compact?: boolean;
};

export function WebsiteHealthCard({
  surfaceClassName,
  healthScore100,
  analyzedAt,
  compact = false,
}: WebsiteHealthCardProps) {
  const healthDisplay10 = healthScore100 ? (healthScore100 / 10).toFixed(1) : "—";
  const interpretation = websiteHealthInterpretationLine(healthScore100);

  return (
    <div className={`${surfaceClassName} flex flex-col ${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`font-medium text-[#eaefff] ${compact ? "text-xs" : "text-sm"}`}>Website Health</span>
        <span
          className={`font-bold tabular-nums tracking-tight ${heroHealthColor(healthScore100)} ${
            compact ? "text-xl" : "text-2xl"
          }`}
        >
          {healthDisplay10} / 10
        </span>
      </div>
      <div className={compact ? "mt-2" : "mt-3"}>
        <AnimatedProgressBar
          value={healthScore100}
          className={`rounded-full bg-white/[0.08] ${compact ? "h-1.5" : "h-2"}`}
          barClassName={healthScoreBarClass(healthScore100)}
        />
        <p className={`leading-snug text-slate-400 ${compact ? "mt-1.5 text-[11px] line-clamp-2" : "mt-2 text-xs"}`}>
          {interpretation}
        </p>
        <p
          className={`text-right leading-snug tracking-wide text-slate-600 ${
            compact ? "mt-1 text-[9px]" : "mt-1 text-[10px]"
          }`}
        >
          {analysisFreshnessCaption(analyzedAt)}
        </p>
      </div>
    </div>
  );
}
