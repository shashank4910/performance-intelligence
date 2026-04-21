/**
 * Revenue Stability Monitoring — business-first comparison of performance snapshots.
 * No chart-first UI; engine outputs feed copy-only surfaces (see docs/FEATURE_REVENUE_STABILITY_MONITORING.md).
 */

import type { SensitivityMode } from "@/lib/revenueImpactSensitivityMath";

export type DominantStage = "landing" | "interaction" | "conversion";

export type MonitoringScores = {
  speed: number;
  ux: number;
  seo: number;
  conversion: number;
};

/** Snapshot bundle stored per analyze run (subset also in DB columns). */
export type MonitoringSnapshot = {
  timestamp: string;
  overallHealth: number | null;
  scores: MonitoringScores;
  coreMetrics: {
    lcp: number | null;
    inp: number | null;
    cls: number | null;
  };
  revenueImpact: { min: number; max: number };
  dominantStage: DominantStage;
};

export type RevenueTrend = "worsening" | "improving" | "stable";

export type SnapshotComparison = {
  deltaRevenueMin: number;
  deltaRevenueMax: number;
  deltaHealth: number;
  trend: RevenueTrend;
  /** True if dominant funnel stage moved to a worse position (e.g. landing → interaction). */
  dominantStageWorsened: boolean;
  /** Midpoint revenue at risk % change (current vs previous). */
  revenueMidpointPctChange: number;
  /** Alert: >10% revenue risk increase OR dominant stage worsened. */
  alertTriggered: boolean;
};

const STAGE_RANK: Record<DominantStage, number> = {
  landing: 0,
  interaction: 1,
  conversion: 2,
};

export function dominantStageFromLeakByMetric(
  leakByMetric: Record<string, number> | null | undefined
): DominantStage {
  if (!leakByMetric || typeof leakByMetric !== "object") return "landing";
  const l = Math.max(0, Number(leakByMetric.lcp) || 0);
  const tbt = Math.max(0, Number(leakByMetric.tbt) || 0);
  const inp = Math.max(0, Number(leakByMetric.inp) || 0);
  const inter = tbt + inp;
  const c = Math.max(0, Number(leakByMetric.cls) || 0);
  const max = Math.max(l, inter, c);
  if (max <= 0) return "landing";
  if (l >= inter && l >= c) return "landing";
  if (inter >= c) return "interaction";
  return "conversion";
}

export function compareMonitoringSnapshots(
  current: MonitoringSnapshot,
  previous: MonitoringSnapshot
): SnapshotComparison {
  const deltaRevenueMin = current.revenueImpact.min - previous.revenueImpact.min;
  const deltaRevenueMax = current.revenueImpact.max - previous.revenueImpact.max;
  const deltaHealth =
    (current.overallHealth ?? 0) - (previous.overallHealth ?? 0);

  const midPrev =
    (previous.revenueImpact.min + previous.revenueImpact.max) / 2;
  const midCur = (current.revenueImpact.min + current.revenueImpact.max) / 2;
  const revenueMidpointPctChange =
    midPrev > 0 ? (midCur - midPrev) / midPrev : midCur > 0 ? 1 : 0;

  const NEGL = 0.02;
  let trend: RevenueTrend;
  if (revenueMidpointPctChange > NEGL) trend = "worsening";
  else if (revenueMidpointPctChange < -NEGL) trend = "improving";
  else trend = "stable";

  const dominantStageWorsened =
    STAGE_RANK[current.dominantStage] > STAGE_RANK[previous.dominantStage];

  const alertTriggered =
    revenueMidpointPctChange > 0.1 || dominantStageWorsened;

  return {
    deltaRevenueMin,
    deltaRevenueMax,
    deltaHealth,
    trend,
    dominantStageWorsened,
    revenueMidpointPctChange,
    alertTriggered,
  };
}

/** Validate narrative vs numbers (logs inconsistency in dev). */
export function validateMonitoringConsistency(
  comparison: SnapshotComparison
): { ok: boolean } {
  const { trend, revenueMidpointPctChange } = comparison;
  const NEGL = 0.02;
  let expectedTrend: RevenueTrend;
  if (revenueMidpointPctChange > NEGL) expectedTrend = "worsening";
  else if (revenueMidpointPctChange < -NEGL) expectedTrend = "improving";
  else expectedTrend = "stable";

  if (trend !== expectedTrend) {
    if (typeof console !== "undefined" && console.error) {
      console.error("Inconsistent system output: trend does not match revenue midpoint change", {
        trend,
        revenueMidpointPctChange,
      });
    }
    return { ok: false };
  }
  return { ok: true };
}

export type WhatChangedBullet = { symbol: "+" | "−" | "="; text: string };

/**
 * Directional bullets only — no ms, no metric names in output strings.
 * INP: if either snapshot lacks INP, we do not claim interaction responsiveness (spec).
 * CLS: if both ~0, no layout / conversion-stage blame (spec TEST 4).
 */
export function buildWhatChangedBullets(
  current: MonitoringSnapshot,
  previous: MonitoringSnapshot
): WhatChangedBullet[] {
  const bullets: WhatChangedBullet[] = [];

  const lcpP = previous.coreMetrics.lcp;
  const lcpC = current.coreMetrics.lcp;
  if (typeof lcpP === "number" && typeof lcpC === "number" && lcpP > 0 && lcpC > 0) {
    const rel = (lcpC - lcpP) / lcpP;
    if (rel < -0.03) bullets.push({ symbol: "+", text: "Load speed improved" });
    else if (rel > 0.03) bullets.push({ symbol: "−", text: "Load speed worsened" });
    else bullets.push({ symbol: "=", text: "Load experience: little change" });
  }

  const inpP = previous.coreMetrics.inp;
  const inpC = current.coreMetrics.inp;
  if (
    typeof inpP === "number" &&
    typeof inpC === "number" &&
    Number.isFinite(inpP) &&
    Number.isFinite(inpC) &&
    inpP > 0 &&
    inpC > 0
  ) {
    const rel = (inpC - inpP) / inpP;
    if (rel < -0.03)
      bullets.push({ symbol: "+", text: "Interaction responsiveness improved" });
    else if (rel > 0.03)
      bullets.push({ symbol: "−", text: "Interaction responsiveness worsened" });
    else bullets.push({ symbol: "=", text: "Interaction feel: little change" });
  }

  const clsP = previous.coreMetrics.cls;
  const clsC = current.coreMetrics.cls;
  const clsRelevant = Math.max(clsP ?? 0, clsC ?? 0) > 0.05;
  if (clsRelevant && typeof clsP === "number" && typeof clsC === "number") {
    const rel =
      clsP > 0 ? (clsC - clsP) / Math.max(clsP, 1e-6) : clsC > clsP ? 1 : 0;
    if (rel < -0.05)
      bullets.push({ symbol: "+", text: "Page stability during key actions improved" });
    else if (rel > 0.05)
      bullets.push({ symbol: "−", text: "Page stability during key actions worsened" });
    else bullets.push({ symbol: "=", text: "Stability during key actions: little change" });
  }

  if (bullets.length === 0) {
    return [{ symbol: "=", text: "Overall impact: no clear directional shift" }];
  }
  return bullets.slice(0, 3);
}

export function buildCurrentStatusLine(
  trend: RevenueTrend,
  dominantStage: DominantStage
): string {
  if (trend === "improving") {
    return "Revenue stability is improving. Performance changes are reducing drop-offs across key user journeys.";
  }
  if (trend === "worsening") {
    if (dominantStage === "interaction") {
      return "Revenue stability is declining. Recent changes are increasing friction during user interaction.";
    }
    if (dominantStage === "conversion") {
      return "Revenue stability is declining. Recent changes are increasing friction closer to conversion.";
    }
    return "Revenue stability is declining. Recent changes are increasing friction early in the journey.";
  }
  return "No meaningful improvement detected. Revenue risk remains largely unchanged.";
}

export function formatRevenueAtRiskLine(min: number, max: number): string {
  const fmt = (n: number) => {
    const r = Math.round(n);
    if (Math.abs(r) >= 1000) return `$${Math.round(r / 1000)}K`;
    return `$${r.toLocaleString("en-US")}`;
  };
  return `${fmt(min)}–${fmt(max)} at risk`;
}

export type MonitoringHistoryEntry = { dateLabel: string; label: "Improved" | "Stable" | "Worsened" };

export function buildMinimalHistory(
  snapshots: MonitoringSnapshot[],
  maxEntries = 5
): MonitoringHistoryEntry[] {
  if (snapshots.length < 2) return [];
  const asc = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const entries: MonitoringHistoryEntry[] = [];
  for (let i = 1; i < asc.length; i++) {
    const prev = asc[i - 1]!;
    const cur = asc[i]!;
    const cmp = compareMonitoringSnapshots(cur, prev);
    const label: MonitoringHistoryEntry["label"] =
      cmp.trend === "improving"
        ? "Improved"
        : cmp.trend === "worsening"
          ? "Worsened"
          : "Stable";
    const d = new Date(cur.timestamp);
    const dateLabel = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    entries.push({ dateLabel, label });
  }
  return entries.slice(-maxEntries);
}

export type RevenueStabilityPayload = {
  currentStatus: string;
  whatChanged: WhatChangedBullet[];
  previousRevenueLine: string;
  currentRevenueLine: string;
  alertMessage: string | null;
  minimalHistory: MonitoringHistoryEntry[];
  comparison: SnapshotComparison;
  consistencyOk: boolean;
};

/** TEST 6: stage narrative must not contradict revenue midpoint trend. */
export function validateStageRevenueAlignment(comparison: SnapshotComparison): boolean {
  if (comparison.trend === "improving" && comparison.dominantStageWorsened) {
    if (typeof console !== "undefined" && console.error) {
      console.error("Inconsistent system output: revenue trend improving but dominant stage worsened");
    }
    return false;
  }
  return true;
}

export function buildRevenueStabilityPayload(
  current: MonitoringSnapshot,
  previous: MonitoringSnapshot,
  historySnapshots?: MonitoringSnapshot[]
): RevenueStabilityPayload {
  const comparison = compareMonitoringSnapshots(current, previous);
  const consistencyOk =
    validateMonitoringConsistency(comparison).ok && validateStageRevenueAlignment(comparison);
  const whatChanged = buildWhatChangedBullets(current, previous);
  const currentStatus = buildCurrentStatusLine(comparison.trend, current.dominantStage);

  const alertMessage = comparison.alertTriggered
    ? "⚠️ Revenue risk has increased after recent changes. This may be affecting conversions."
    : null;

  const minimalHistory =
    historySnapshots && historySnapshots.length >= 2
      ? buildMinimalHistory(historySnapshots, 5)
      : [];

  return {
    currentStatus,
    whatChanged,
    previousRevenueLine: formatRevenueAtRiskLine(
      previous.revenueImpact.min,
      previous.revenueImpact.max
    ),
    currentRevenueLine: formatRevenueAtRiskLine(
      current.revenueImpact.min,
      current.revenueImpact.max
    ),
    alertMessage,
    minimalHistory,
    comparison,
    consistencyOk,
  };
}

/** Map DB row + leak data to MonitoringSnapshot (server-side). */
export function monitoringSnapshotFromDbRow(row: {
  timestamp: Date;
  overallHealth: number | null;
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  revenueAtRiskMin: number | null;
  revenueAtRiskMax: number | null;
  dominantStage: string | null;
  monitoringScores: unknown;
}): MonitoringSnapshot | null {
  if (
    row.revenueAtRiskMin == null ||
    row.revenueAtRiskMax == null ||
    !row.dominantStage
  ) {
    return null;
  }
  const ds = row.dominantStage as DominantStage;
  if (ds !== "landing" && ds !== "interaction" && ds !== "conversion") return null;

  const scores = row.monitoringScores as MonitoringScores | null;
  if (
    !scores ||
    typeof scores.speed !== "number" ||
    typeof scores.ux !== "number" ||
    typeof scores.seo !== "number" ||
    typeof scores.conversion !== "number"
  ) {
    return null;
  }

  return {
    timestamp: row.timestamp.toISOString(),
    overallHealth: row.overallHealth,
    scores,
    coreMetrics: {
      lcp: row.lcp,
      inp: row.inp,
      cls: row.cls,
    },
    revenueImpact: {
      min: row.revenueAtRiskMin,
      max: row.revenueAtRiskMax,
    },
    dominantStage: ds,
  };
}

export type { SensitivityMode };
