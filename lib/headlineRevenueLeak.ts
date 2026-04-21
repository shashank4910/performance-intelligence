/**
 * Single headline path for "monthly revenue at risk" from the locked V2 behavioral model.
 * CORTEX remains available separately as diagnostic-only (see analyze `cortex_diagnostic`).
 */

import { computeBehaviorRevenueImpact } from "@/lib/impactEngine/v2BehaviorModel";

export type BehaviorLeakMetricsMs = {
  lcp?: number;
  tbt?: number;
  inp?: number;
  cls?: number;
};

export function behaviorMetricsMsFromLighthouseAudits(
  audits: Record<string, { numericValue?: number } | null | undefined> | null | undefined
): BehaviorLeakMetricsMs {
  if (!audits) return {};
  const num = (id: string): number | undefined => {
    const v = audits[id]?.numericValue;
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };
  return {
    lcp: num("largest-contentful-paint"),
    tbt: num("total-blocking-time"),
    inp: num("interaction-to-next-paint"),
    cls: num("cumulative-layout-shift"),
  };
}

/** DB snapshot stores LCP/INP/TBT in seconds; CLS is 0–1. */
export function behaviorMetricsMsFromSnapshotSeconds(params: {
  lcp: number | null | undefined;
  inp: number | null | undefined;
  tbt: number | null | undefined;
  cls: number | null | undefined;
}): BehaviorLeakMetricsMs {
  const secToMs = (sec: number | null | undefined): number | undefined => {
    if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return undefined;
    return sec * 1000;
  };
  const cls =
    typeof params.cls === "number" && Number.isFinite(params.cls) ? params.cls : undefined;
  return {
    lcp: secToMs(params.lcp),
    tbt: secToMs(params.tbt),
    inp: secToMs(params.inp),
    cls,
  };
}

export function computeHeadlineRevenueLeak(baselineRevenue: number, metricsMs: BehaviorLeakMetricsMs) {
  return computeBehaviorRevenueImpact({
    baselineRevenue,
    metrics: {
      lcp: metricsMs.lcp,
      tbt: metricsMs.tbt,
      inp: metricsMs.inp,
      cls: metricsMs.cls,
    },
  });
}

const INTERACTION_POOL_ENGINE_KEYS = new Set([
  "tti",
  "mainthread",
  "bootuptime",
  "longtasks",
]);

function normalizedLeakMap(leakByMetric: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(leakByMetric)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[k.toLowerCase()] = v;
    }
  }
  return out;
}

/**
 * Dollar slice for a metric drawer / priority row.
 * Behavioral `leakByMetric` uses lcp/tbt/inp/cls only. TTI (and similar) pool TBT+INP for attribution in that view only.
 */
export function resolveLeakForMetricDrawer(
  engineKey: string | null | undefined,
  leakByMetric: Record<string, number>
): number {
  if (!engineKey) return 0;
  const leak = normalizedLeakMap(leakByMetric);
  const k = engineKey.toLowerCase();
  if (leak[k] != null && leak[k] > 0) return leak[k];
  if (INTERACTION_POOL_ENGINE_KEYS.has(k)) {
    const tbt = leak.tbt ?? 0;
    const inp = leak.inp ?? 0;
    return Math.max(0, tbt + inp);
  }
  return 0;
}
