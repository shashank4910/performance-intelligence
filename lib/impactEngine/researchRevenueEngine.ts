/**
 * ⚠️ LOCKED DECISION
 * Revenue Impact Model V2 is defined in /docs/DECISION_LOG.md
 *
 * Do NOT modify core impact logic without explicit approval.
 * This is a foundational product decision.
 */

/**
 * Research-backed Revenue Impact Engine.
 * Converts performance metric degradation into conversion drop and revenue leak.
 * Does not replace CORTEX stage analysis; replaces baseline revenue and leak calculation.
 *
 * Sensitivity coefficients (research-based):
 * - 1s degradation LCP → ~6% conversion loss
 * - 1s degradation TTI → ~5% conversion loss
 * - 1s degradation Speed Index → ~4% conversion loss
 * - 1s degradation TBT → ~3% conversion loss
 * - CLS unit increase → ~2% conversion loss
 */

const CONVERSION_DROP_CAP = 0.6;

/** Sensitivity per metric: conversion loss per 1 second delay (or per 1 CLS unit). */
export const SENSITIVITY_COEFFICIENTS: Record<string, number> = {
  lcp: 0.06,
  tti: 0.05,
  speedIndex: 0.04,
  tbt: 0.03,
  cls: 0.02,
};

/** Optimal thresholds: metric value below this = no penalty. Values in ms except CLS (0–1). */
const OPTIMAL_THRESHOLDS: Record<string, number> = {
  lcp: 2500,
  tti: 3800,
  speedIndex: 3400,
  tbt: 300,
  cls: 0.1,
};

/** Lighthouse audit id → metric key. */
const AUDIT_TO_METRIC: Record<string, string> = {
  "largest-contentful-paint": "lcp",
  interactive: "tti",
  "speed-index": "speedIndex",
  "total-blocking-time": "tbt",
  "cumulative-layout-shift": "cls",
};

export type ResearchEngineMetricsInput = {
  /** Audit id → numericValue (ms for time metrics, 0–1 for CLS). */
  audits: Record<string, { numericValue?: number }> | null | undefined;
};

export type ResearchEngineResult = {
  baselineRevenue: number;
  conversionDrop: number;
  estimatedMonthlyLeak: number;
  leakByMetric: Record<string, number>;
  metricPenalties: Record<string, number>;
};

/**
 * Compute delay in seconds above threshold for a time metric (ms).
 * For CLS (0–1), return severity above 0.1 as "equivalent" (we apply coefficient directly).
 */
function delaySeconds(
  metricKey: string,
  valueMsOrCls: number
): number {
  const threshold = OPTIMAL_THRESHOLDS[metricKey];
  if (threshold == null) return 0;
  if (metricKey === "cls") {
    // CLS is 0–1; treat excess above 0.1 as "severity" (no seconds).
    return Math.max(0, valueMsOrCls - threshold);
  }
  if (!Number.isFinite(valueMsOrCls)) return 0;
  return Math.max(0, (valueMsOrCls - threshold) / 1000);
}

/**
 * Compute per-metric penalties and total conversion drop.
 * conversionDrop = sum(metricPenalty), clamped to CONVERSION_DROP_CAP.
 */
function computeConversionDrop(audits: Record<string, { numericValue?: number }>): {
  conversionDrop: number;
  metricPenalties: Record<string, number>;
} {
  const metricPenalties: Record<string, number> = {};
  let sumPenalty = 0;

  for (const [auditId, metricKey] of Object.entries(AUDIT_TO_METRIC)) {
    const audit = audits[auditId];
    const raw = audit?.numericValue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const coef = SENSITIVITY_COEFFICIENTS[metricKey];
    if (coef == null) continue;
    const delay = delaySeconds(metricKey, raw);
    const penalty = metricKey === "cls" ? raw * coef : delay * coef;
    if (penalty > 0) {
      metricPenalties[metricKey] = penalty;
      sumPenalty += penalty;
    }
  }

  const conversionDrop = Math.min(CONVERSION_DROP_CAP, sumPenalty);
  return { conversionDrop, metricPenalties };
}

/**
 * Distribute total revenue leak across metrics by penalty share.
 * Sum(leakByMetric) === estimatedMonthlyLeak (within rounding).
 */
function distributeLeakByMetric(
  totalLeak: number,
  metricPenalties: Record<string, number>
): Record<string, number> {
  const leakByMetric: Record<string, number> = {};
  const sumPenalty = Object.values(metricPenalties).reduce((a, b) => a + b, 0);
  if (sumPenalty <= 0) return leakByMetric;

  const totalCents = Math.round(totalLeak * 100);
  const entries = Object.entries(metricPenalties);
  const centsPerMetric = entries.map(([, p]) => Math.floor((totalCents * p) / sumPenalty));
  let assigned = centsPerMetric.reduce((s, c) => s + c, 0);
  let remainder = totalCents - assigned;
  if (remainder > 0) {
    const byFraction = entries
      .map((_, i) => ({ i, frac: (totalCents * metricPenalties[entries[i][0]]!) / sumPenalty - centsPerMetric[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remainder && k < byFraction.length; k++) {
      centsPerMetric[byFraction[k].i] += 1;
    }
  }
  entries.forEach(([key], i) => {
    leakByMetric[key] = centsPerMetric[i]! / 100;
  });
  return leakByMetric;
}

/**
 * Research-backed revenue impact: baselineRevenue × conversionDrop = revenue leak.
 * Returns estimatedMonthlyLeak and leakByMetric for attribution.
 */
export function computeResearchRevenueLeak(
  baselineRevenue: number,
  metricsInput: ResearchEngineMetricsInput
): ResearchEngineResult {
  const audits = metricsInput.audits ?? {};
  const { conversionDrop, metricPenalties } = computeConversionDrop(audits);
  const estimatedMonthlyLeak = Math.round(baselineRevenue * conversionDrop * 100) / 100;
  const leakByMetric = distributeLeakByMetric(estimatedMonthlyLeak, metricPenalties);

  return {
    baselineRevenue,
    conversionDrop,
    estimatedMonthlyLeak,
    leakByMetric,
    metricPenalties,
  };
}
