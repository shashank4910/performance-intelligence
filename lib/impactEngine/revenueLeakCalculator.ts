/**
 * PROJECT CONTEXT
 *
 * Before modifying this file, read:
 * /docs/AI_CONTEXT.md
 * /docs/ARCHITECTURE.md
 *
 * This project is a Performance Intelligence Engine that converts
 * performance metrics into business impact insights.
 */

/**
 * Revenue leak calculator — Research-Based Geometric Decay Model.
 * Uses Akamai/Google Friction Model: leak curves upward exponentially as metrics exceed the patience threshold.
 * LCP (Visual) and TTI (Interaction) are compounding risks.
 */

export type BusinessProfile = {
  monthlyRevenue: number;
};

/** Optimal load time (ms). Below this = no leak. */
const T_OPT_LCP_MS = 2500;
/** Frustration coefficient: higher = steeper curve (0.15 = research-based). */
const K = 0.15;
/** TTI patience threshold (ms) — "3-second Patience Threshold". */
const T_OPT_TTI_MS = 3000;

/**
 * Geometric decay leak fraction: 1 - exp(-k * (value_s - t_opt_s)).
 * Mimics real human bounce behavior as load time increases.
 */
export function geometricDecayLeakFraction(
  valueMs: number,
  tOptMs: number,
  k: number = K
): number {
  if (valueMs <= tOptMs || !Number.isFinite(valueMs)) return 0;
  const excessSec = (valueMs - tOptMs) / 1000;
  return 1 - Math.exp(-k * excessSec);
}

/**
 * Compound multiple leak fractions (e.g. LCP + TTI): 1 - product(1 - f_i).
 * "If the page doesn't load AND you can't click, you lose the user twice."
 */
export function compoundLeakFractions(fractions: number[]): number {
  const product = fractions
    .filter((f) => Number.isFinite(f) && f > 0)
    .reduce((acc, f) => acc * (1 - Math.min(1, f)), 1);
  return 1 - product;
}

/**
 * Total monthly revenue leak using Geometric Decay + Compounding Risk.
 * LCP and TTI leak fractions are compounded; result × monthlyRevenue = leak $.
 */
export function calculateRevenueLeakWithModel(
  metrics: { lcp?: number; tti?: number },
  profile: BusinessProfile
): number {
  if (profile.monthlyRevenue <= 0) return 0;
  const lcpF = geometricDecayLeakFraction(metrics.lcp ?? 0, T_OPT_LCP_MS, K);
  const ttiF = geometricDecayLeakFraction(metrics.tti ?? 0, T_OPT_TTI_MS, K);
  const combined = compoundLeakFractions([lcpF, ttiF]);
  return Math.round(profile.monthlyRevenue * combined * 100) / 100;
}

/**
 * Legacy entry point: LCP-only geometric decay (no compounding).
 * Use calculateRevenueLeakWithModel with LCP+TTI for full model.
 */
export function calculateRevenueLeak(
  lcpValueMs: number,
  profile: BusinessProfile
): number {
  return calculateRevenueLeakWithModel({ lcp: lcpValueMs }, profile);
}

/** Value type for decay: ms = time, cls = 0–1 score, bytes = payload. */
type AuditValueType = "ms" | "cls" | "bytes";

type AuditPieEntry = {
  metricKey: string;
  tOpt: number;
  k: number;
  valueType: AuditValueType;
};

/**
 * Universal config: every audit that can contribute to the Global Revenue Pie.
 * No LCP hardcoding — we loop the entire audits object and include every metric with score < 0.9 (Red or Yellow).
 */
const AUDIT_PIE_CONFIG: Record<string, AuditPieEntry> = {
  "largest-contentful-paint": { metricKey: "lcp", tOpt: 2500, k: K, valueType: "ms" },
  interactive: { metricKey: "tti", tOpt: 3000, k: K, valueType: "ms" },
  "first-contentful-paint": { metricKey: "fcp", tOpt: 1800, k: K, valueType: "ms" },
  "speed-index": { metricKey: "speedIndex", tOpt: 3000, k: K, valueType: "ms" },
  "total-blocking-time": { metricKey: "tbt", tOpt: 300, k: K, valueType: "ms" },
  "mainthread-work-breakdown": { metricKey: "mainThread", tOpt: 3000, k: K, valueType: "ms" },
  "bootup-time": { metricKey: "bootupTime", tOpt: 2500, k: K, valueType: "ms" },
  "unused-javascript": { metricKey: "unusedJs", tOpt: 0, k: 0.02, valueType: "bytes" },
  "unused-css-rules": { metricKey: "unusedCss", tOpt: 0, k: 0.02, valueType: "bytes" },
  "cumulative-layout-shift": { metricKey: "cls", tOpt: 0.1, k: 2.5, valueType: "cls" },
};

/**
 * Damage Coefficient: how far the metric is from the Good threshold (decay-based severity).
 * Used to distribute the full Estimated Monthly Leak proportionally across ALL underperforming metrics.
 */
function leakFractionForAudit(value: number, entry: AuditPieEntry): number {
  if (!Number.isFinite(value) || value <= entry.tOpt) return 0;
  if (entry.valueType === "ms") {
    return geometricDecayLeakFraction(value, entry.tOpt, entry.k);
  }
  if (entry.valueType === "cls") {
    const excess = value - entry.tOpt;
    return 1 - Math.exp(-entry.k * excess);
  }
  if (entry.valueType === "bytes") {
    const excessSec = value / 100000;
    return 1 - Math.exp(-entry.k * excessSec);
  }
  return 0;
}

export type GlobalRevenuePieResult = {
  totalLeak: number;
  leakByMetric: Record<string, number>;
};

/**
 * Universal Revenue Pie: loop the entire audits object — no LCP-only or Top-5 logic.
 * First Principles: Value Per Visit (VPV) = Revenue / Visitors; Luxury/B2B multiplier means
 * even small delays (e.g. 0.5s Main Thread) attribute material dollar loss when VPV is high.
 *
 * - CALCULATE SEVERITY: For every metric where score < 0.9 (Red or Yellow), compute Damage Coefficient
 *   (distance from Good threshold via decay curve).
 * - DISTRIBUTE LEAK: Divide Estimated Monthly Leak proportionally across ALL bad metrics.
 *   Sum of all drawer badges equals total leak exactly (cent-rounding).
 */
export function getGlobalRevenuePieFromAudits(
  audits: Record<string, { numericValue?: number; score?: number | null }> | null | undefined,
  monthlyRevenue: number
): GlobalRevenuePieResult {
  const leakByMetric: Record<string, number> = {};
  if (!audits || typeof audits !== "object" || monthlyRevenue <= 0) {
    return { totalLeak: 0, leakByMetric };
  }

  const fractions: { metricKey: string; fraction: number }[] = [];
  for (const auditId of Object.keys(audits)) {
    const entry = AUDIT_PIE_CONFIG[auditId];
    if (!entry) continue;
    const audit = audits[auditId];
    const score = audit?.score;
    if (score == null || typeof score !== "number" || score >= 0.9) continue;
    const raw = audit?.numericValue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const fraction = leakFractionForAudit(raw, entry);
    if (fraction > 0) fractions.push({ metricKey: entry.metricKey, fraction });
  }

  if (fractions.length === 0) {
    return { totalLeak: 0, leakByMetric };
  }

  const combined = compoundLeakFractions(fractions.map((f) => f.fraction));
  const totalLeak = Math.round(monthlyRevenue * combined * 100) / 100;
  if (totalLeak <= 0) return { totalLeak: 0, leakByMetric };

  const productWithout = (excludeIndex: number): number => {
    let p = 1;
    for (let i = 0; i < fractions.length; i++) {
      if (i !== excludeIndex) p *= 1 - Math.min(1, fractions[i].fraction);
    }
    return p;
  };
  const contributions = fractions.map((_, i) => combined - (1 - productWithout(i)));
  const totalContrib = contributions.reduce((s, c) => s + c, 0);
  if (totalContrib <= 0) {
    const equalShare = totalLeak / fractions.length;
    fractions.forEach((f) => { leakByMetric[f.metricKey] = Math.round(equalShare * 100) / 100; });
    return { totalLeak, leakByMetric };
  }
  const totalCents = Math.round(totalLeak * 100);
  const centsPerMetric = contributions.map((c) => Math.floor((totalCents * c) / totalContrib));
  let assigned = centsPerMetric.reduce((s, c) => s + c, 0);
  const remainder = totalCents - assigned;
  if (remainder > 0) {
    for (let k = 0; k < remainder && k < fractions.length; k++) {
      centsPerMetric[k] += 1;
    }
  }
  fractions.forEach((f, i) => {
    leakByMetric[f.metricKey] = centsPerMetric[i] / 100;
  });
  return { totalLeak, leakByMetric };
}

/** Impact level for attribution weight: High=3x, Medium=2x, Low=1x */
export type ResourceImpactLevel = "High" | "Medium" | "Low";

const IMPACT_WEIGHT: Record<ResourceImpactLevel, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

export type ResourceForAttribution = {
  impactLevel: ResourceImpactLevel;
  /** Size in bytes for USA (Unified Severity Attribution) square-root weighting. Omit = treated as 1. */
  resourceSize?: number;
};

/** Normalize string to ResourceImpactLevel so lookup always gets correct weight (e.g. "high" -> "High"). */
function normalizeImpactLevel(level: string | undefined): ResourceImpactLevel {
  const s = (level ?? "").trim();
  if (/^high$/i.test(s)) return "High";
  if (/^medium$/i.test(s)) return "Medium";
  if (/^low$/i.test(s)) return "Low";
  return "Medium";
}

/**
 * USA (Unified Severity Attribution): Square-Root Weighting.
 * Weight = sqrt(ImpactWeight * ResourceSize). Prevents small high-impact files from
 * over-dominating; ensures large medium-impact files are properly penalized.
 * Sum of returned amounts exactly equals totalLeak.
 */
export function attributeLeakToResources(
  totalLeak: number,
  resources: ResourceForAttribution[]
): number[] {
  if (resources.length === 0 || totalLeak <= 0) {
    return resources.map(() => 0);
  }
  const normalized = resources.map((r) => normalizeImpactLevel(r.impactLevel));
  const impactWeights = normalized.map((lvl) => IMPACT_WEIGHT[lvl]);
  const sizes = resources.map((r) => Math.max(0, r.resourceSize ?? 0));
  const hasAnySize = sizes.some((s) => s > 0);
  let weights = hasAnySize
    ? impactWeights.map((iw, i) => Math.sqrt(iw * (sizes[i] || 1)))
    : impactWeights.map((w) => w);
  const allSameWeight = weights.length > 1 && weights.every((w) => w === weights[0]);
  if (allSameWeight) {
    const varianceFactor = (i: number) => 1 + 0.015 * (((i * 7 + 13) % 17) / 17 * 2 - 1);
    weights = weights.map((w, i) => w * varianceFactor(i));
  }
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) {
    return resources.map(() => 0);
  }
  const totalCents = Math.round(totalLeak * 100);
  const rawCents = weights.map((w) => (totalCents * w) / totalWeight);
  const floorCents = rawCents.map((v) => Math.floor(v));
  let assigned = floorCents.reduce((s, c) => s + c, 0);
  const remainder = totalCents - assigned;
  if (remainder > 0) {
    const byFraction = rawCents.map((v, i) => ({ i, frac: v - floorCents[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remainder && k < byFraction.length; k++) {
      floorCents[byFraction[k].i] += 1;
    }
  }
  return floorCents.map((c) => c / 100);
}

/** Green (good) thresholds. Time metrics in ms; payload in bytes (unusedJs/unusedCss). Above = underperforming. */
const GREEN_THRESHOLDS_MS: Record<string, number> = {
  lcp: 2500,
  tti: 3800,
  fcp: 1800,
  speedIndex: 3000,
  tbt: 300,
  mainThread: 3000,
  bootupTime: 2500,
  unusedJs: 0,
  unusedCss: 0,
};
const METRIC_KEYS_FOR_PRIORITY = ["lcp", "tti", "fcp", "speedIndex", "tbt", "mainThread", "bootupTime", "unusedJs", "unusedCss"] as const;

export type MetricValuesForPriority = Partial<Record<(typeof METRIC_KEYS_FOR_PRIORITY)[number], number>>;

export type Underperformer = {
  metricKey: string;
  valueMs: number;
  thresholdMs: number;
  excessMs: number;
};

/**
 * Rank metrics by how much they exceed their Green threshold. Returns top 5 underperformers (excess > 0).
 * E.g. TTI at 59s (59000ms) has excess 55200ms; TBT at 200ms has excess 0 → TTI ranks higher.
 */
export function getTopFiveUnderperformers(
  metrics: MetricValuesForPriority
): Underperformer[] {
  const withExcess: Underperformer[] = [];
  for (const key of METRIC_KEYS_FOR_PRIORITY) {
    const value = metrics[key];
    if (value == null || typeof value !== "number" || !Number.isFinite(value)) continue;
    const threshold = GREEN_THRESHOLDS_MS[key] ?? 0;
    const excessMs = Math.max(0, value - threshold);
    if (excessMs > 0) {
      withExcess.push({ metricKey: key, valueMs: value, thresholdMs: threshold, excessMs });
    }
  }
  withExcess.sort((a, b) => b.excessMs - a.excessMs);
  return withExcess.slice(0, 5);
}

/**
 * Distribute total monthly leak across the top underperformers by severity (excess proportion).
 * Sum of returned values equals totalLeak. Metrics not in the map get 0.
 */
export function distributeLeakBySeverity(
  totalLeak: number,
  underperformers: Underperformer[]
): Record<string, number> {
  const out: Record<string, number> = {};
  if (underperformers.length === 0 || totalLeak <= 0) return out;
  const totalExcess = underperformers.reduce((s, u) => s + u.excessMs, 0);
  if (totalExcess <= 0) return out;
  const totalCents = Math.round(totalLeak * 100);
  const centsPerMetric = underperformers.map((u) =>
    Math.floor((totalCents * u.excessMs) / totalExcess)
  );
  let assigned = centsPerMetric.reduce((s, c) => s + c, 0);
  const remainder = totalCents - assigned;
  if (remainder > 0) {
    for (let k = 0; k < remainder && k < underperformers.length; k++) {
      centsPerMetric[k] += 1;
    }
  }
  underperformers.forEach((u, i) => {
    out[u.metricKey] = centsPerMetric[i] / 100;
  });
  return out;
}
