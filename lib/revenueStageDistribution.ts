/**
 * Metric-driven funnel stage weights for revenue intelligence.
 * Aligns stage distribution, CTA bounds, and priority ordering with Core Web Vitals
 * severity — not driver-template guesses. See product rules in task spec / SYSTEM_STATE.
 */

export type MetricSeverity = "good" | "medium" | "bad" | "unknown";

/** Snapshot units: LCP/TBT/INP/TTI in seconds (Lighthouse ms / 1000), CLS raw score. */
export type RevenueStageSnapshot = {
  lcpSeconds: number | null | undefined;
  inpSeconds: number | null | undefined;
  tbtSeconds: number | null | undefined;
  cls: number | null | undefined;
  /** Optional lab TTI (seconds); strengthens interaction stage when INP missing. */
  ttiSeconds?: number | null | undefined;
};

const THRESHOLDS = {
  LCP: { good: 2.5, medium: 4 },
  INP_MS: { good: 200, medium: 500 },
  TBT_MS: { good: 200, medium: 600 },
  CLS: { good: 0.1, medium: 0.25 },
  TTI_MS: { good: 3800, medium: 7300 },
} as const;

/**
 * good: metric <= good
 * medium: metric <= medium
 * bad: metric > medium
 */
export function getSeverity(
  metric: number | null | undefined,
  thresholds: { good: number; medium: number }
): MetricSeverity {
  if (metric == null || !Number.isFinite(metric)) return "unknown";
  if (metric <= thresholds.good) return "good";
  if (metric <= thresholds.medium) return "medium";
  return "bad";
}

function severityRank(s: MetricSeverity): number {
  if (s === "bad") return 3;
  if (s === "medium") return 2;
  if (s === "good") return 1;
  return 0;
}

/** Base weights: good → low band, medium → mid, bad → high, unknown → mid. */
export function severityToWeight(severity: MetricSeverity): number {
  switch (severity) {
    case "good":
      return 0.15;
    case "medium":
      return 0.4;
    case "bad":
      return 0.75;
    default:
      return 0.35;
  }
}

function worseSeverity(a: MetricSeverity, b: MetricSeverity): MetricSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

export type StageWeightTriple = {
  landing: number;
  interaction: number;
  conversion: number;
  /** True when CLS is in the "good" Web Vitals bucket — conversion messaging must not blame layout. */
  clsGoodForMessaging: boolean;
  /** Post-normalization share of conversion (0–1); ≤ 0.10 when CLS is good (enforced). */
  conversionShare: number;
};

/**
 * Raw (pre-normalize) weights from snapshot metrics + dominance / gating rules.
 */
export function computeStageMetricWeights(snapshot: RevenueStageSnapshot | null | undefined): StageWeightTriple {
  const lcp = snapshot?.lcpSeconds;
  const cls = snapshot?.cls;
  const inpSec = snapshot?.inpSeconds;
  const tbtSec = snapshot?.tbtSeconds;
  const ttiSec = snapshot?.ttiSeconds;

  const lcpSev = getSeverity(typeof lcp === "number" ? lcp : null, THRESHOLDS.LCP);
  const clsSev = getSeverity(typeof cls === "number" ? cls : null, THRESHOLDS.CLS);
  const clsGoodForMessaging = clsSev === "good";

  const inpMs = typeof inpSec === "number" && Number.isFinite(inpSec) ? inpSec * 1000 : null;
  const tbtMs = typeof tbtSec === "number" && Number.isFinite(tbtSec) ? tbtSec * 1000 : null;
  const ttiMs = typeof ttiSec === "number" && Number.isFinite(ttiSec) ? ttiSec * 1000 : null;

  const inpSev = inpMs != null ? getSeverity(inpMs, THRESHOLDS.INP_MS) : ("unknown" as MetricSeverity);
  const tbtSev = tbtMs != null ? getSeverity(tbtMs, THRESHOLDS.TBT_MS) : ("unknown" as MetricSeverity);
  const ttiSev = ttiMs != null ? getSeverity(ttiMs, THRESHOLDS.TTI_MS) : ("unknown" as MetricSeverity);

  let interactionSeverity: MetricSeverity = "unknown";
  if (inpMs != null && tbtMs != null) {
    interactionSeverity = worseSeverity(inpSev, tbtSev);
  } else if (inpMs != null) {
    interactionSeverity = inpSev;
  } else if (tbtMs != null) {
    interactionSeverity = tbtSev;
  } else if (ttiMs != null) {
    interactionSeverity = ttiSev;
  }

  const wL = severityToWeight(lcpSev);
  let wI = severityToWeight(interactionSeverity);
  let wC = severityToWeight(clsSev);

  const inpBad = inpMs != null && inpSev === "bad";
  const tbtBad = tbtMs != null && tbtSev === "bad";
  const interactionBad =
    interactionSeverity === "bad" ||
    (inpMs == null && tbtBad) ||
    (tbtMs == null && inpBad) ||
    (ttiMs != null && ttiSev === "bad" && inpMs == null && tbtMs == null);

  if (inpBad && tbtBad) {
    wI *= 1.28;
  }

  if (interactionBad) {
    wI = Math.max(wI, Math.max(wL, wC) * 1.08 + 1e-4);
  }

  if (lcpSev === "medium" && interactionBad) {
    wI = Math.max(wI, wL * 1.06 + 1e-4);
  }

  // CLS good → conversion at most 10% of total weight mass
  if (clsGoodForMessaging) {
    const cap = ((wL + wI) * 0.1) / 0.9;
    wC = Math.min(wC, cap);
  }

  const sum = wL + wI + wC;
  if (sum <= 0) {
    return {
      landing: 1 / 3,
      interaction: 1 / 3,
      conversion: 1 / 3,
      clsGoodForMessaging,
      conversionShare: 1 / 3,
    };
  }

  let nL = wL / sum;
  let nI = wI / sum;
  let nC = wC / sum;

  if (clsGoodForMessaging && nC > 0.1 + 1e-9) {
    const other = nL + nI;
    const targetC = Math.min(nC, 0.1);
    const scale = other > 0 ? (1 - targetC) / other : 1;
    nL *= scale;
    nI *= scale;
    nC = targetC;
    const t = nL + nI + nC;
    nL /= t;
    nI /= t;
    nC /= t;
  }

  return {
    landing: nL,
    interaction: nI,
    conversion: nC,
    clsGoodForMessaging,
    conversionShare: nC,
  };
}

export type CanonicalStage = "Landing" | "Activation" | "Conversion";

/** Sum tolerance for recoverable distribution (fraction of target). */
export const STAGE_RECOVERABLE_SUM_TOLERANCE = 0.02;

/**
 * Distribute `recoverableExpected` across the three canonical stages using metric weights.
 * Returns dollar amounts (same currency as input) that sum within tolerance of target.
 */
export function distributeRecoverableAcrossStages(
  snapshot: RevenueStageSnapshot | null | undefined,
  recoverableExpected: number
): Record<CanonicalStage, number> {
  const target = Math.max(0, Number.isFinite(recoverableExpected) ? recoverableExpected : 0);
  if (target <= 0) {
    return { Landing: 0, Activation: 0, Conversion: 0 };
  }

  const w = computeStageMetricWeights(snapshot);
  let land = target * w.landing;
  let act = target * w.interaction;
  let conv = target * w.conversion;
  const sum = land + act + conv;
  if (sum <= 0) {
    const third = Math.round((target / 3) * 100) / 100;
    const rest = Math.round((target - third * 3) * 100) / 100;
    const out = { Landing: third, Activation: third, Conversion: third };
    if (rest !== 0) {
      out.Landing = Math.round((out.Landing + rest) * 100) / 100;
    }
    return out;
  }

  const scale = target / sum;
  land *= scale;
  act *= scale;
  conv *= scale;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  let la = round2(land);
  let ac = round2(act);
  let co = round2(conv);
  let t = la + ac + co;
  const diff = round2(target - t);
  const idx = la >= ac && la >= co ? 0 : ac >= la && ac >= co ? 1 : 2;
  if (idx === 0) la = round2(la + diff);
  else if (idx === 1) ac = round2(ac + diff);
  else co = round2(co + diff);

  t = la + ac + co;
  if (target > 0 && Math.abs(t - target) / target > STAGE_RECOVERABLE_SUM_TOLERANCE) {
    la = round2((land / sum) * target);
    ac = round2((act / sum) * target);
    co = round2(target - la - ac);
  }

  return { Landing: la, Activation: ac, Conversion: co };
}

export function maxStageRecoverableAmount(amounts: Record<CanonicalStage, number>): number {
  return Math.max(amounts.Landing, amounts.Activation, amounts.Conversion, 0);
}

export function sumStageRecoverableAmounts(amounts: Record<CanonicalStage, number>): number {
  return amounts.Landing + amounts.Activation + amounts.Conversion;
}

/**
 * CTA headline max recoverable: opportunityHigh × recoveryFactorMax (caller supplies).
 * Enforces CTA ≥ max stage, CTA ≥ sum(stages), CTA ≤ totalLossCap.
 */
export function reconcileMaxRecoverableCta(params: {
  opportunityHigh: number;
  recoveryFactorMax: number;
  stageAmounts: Record<CanonicalStage, number>;
  totalLossCap: number;
}): number {
  const high = Math.max(0, params.opportunityHigh);
  const cap = Math.max(0, params.totalLossCap);
  let cta = Math.round(high * params.recoveryFactorMax);
  const sumS = sumStageRecoverableAmounts(params.stageAmounts);
  const maxS = maxStageRecoverableAmount(params.stageAmounts);
  cta = Math.max(cta, Math.ceil(sumS), Math.ceil(maxS));
  if (cap > 0) cta = Math.min(cta, Math.round(cap));
  return Math.max(0, cta);
}

/** Map engine / leak keys to canonical stage for priority alignment. */
export function canonicalStageForEngineKey(engineKey: string): CanonicalStage {
  const k = engineKey.toLowerCase().replace(/-/g, "");
  if (k === "cls") return "Conversion";
  if (k === "lcp" || k === "fcp" || k === "speedindex" || k === "ttfb") return "Landing";
  if (
    k === "tti" ||
    k === "tbt" ||
    k === "inp" ||
    k === "mainthread" ||
    k === "bootuptime" ||
    k === "unusedjs" ||
    k === "unusedcss"
  ) {
    return "Activation";
  }
  return "Landing";
}

/**
 * Build snapshot for stage model from dashboard/API-shaped blobs (best-effort).
 */
/** LCP → speed axis, merged INP/TBT/TTI → interaction axis, CLS → stability axis (same rules as stage weights). */
export function snapshotAxisSeverities(snapshot: RevenueStageSnapshot | null | undefined): {
  speed: MetricSeverity;
  interaction: MetricSeverity;
  stability: MetricSeverity;
} {
  const empty = { speed: "unknown" as const, interaction: "unknown" as const, stability: "unknown" as const };
  if (!snapshot) return empty;

  const lcp = snapshot.lcpSeconds;
  const cls = snapshot.cls;
  const inpSec = snapshot.inpSeconds;
  const tbtSec = snapshot.tbtSeconds;
  const ttiSec = snapshot.ttiSeconds;

  const speed = getSeverity(typeof lcp === "number" ? lcp : null, THRESHOLDS.LCP);
  const stability = getSeverity(typeof cls === "number" ? cls : null, THRESHOLDS.CLS);

  const inpMs = typeof inpSec === "number" && Number.isFinite(inpSec) ? inpSec * 1000 : null;
  const tbtMs = typeof tbtSec === "number" && Number.isFinite(tbtSec) ? tbtSec * 1000 : null;
  const ttiMs = typeof ttiSec === "number" && Number.isFinite(ttiSec) ? ttiSec * 1000 : null;

  const inpSev = inpMs != null ? getSeverity(inpMs, THRESHOLDS.INP_MS) : ("unknown" as MetricSeverity);
  const tbtSev = tbtMs != null ? getSeverity(tbtMs, THRESHOLDS.TBT_MS) : ("unknown" as MetricSeverity);
  const ttiSev = ttiMs != null ? getSeverity(ttiMs, THRESHOLDS.TTI_MS) : ("unknown" as MetricSeverity);

  let interaction: MetricSeverity = "unknown";
  if (inpMs != null && tbtMs != null) {
    interaction = worseSeverity(inpSev, tbtSev);
  } else if (inpMs != null) {
    interaction = inpSev;
  } else if (tbtMs != null) {
    interaction = tbtSev;
  } else if (ttiMs != null) {
    interaction = ttiSev;
  }

  return { speed, interaction, stability };
}

export function revenueStageSnapshotFromAnalyzeData(data: {
  revenueImpactInputs?: { lcpSeconds?: number; cls?: number; inpMs?: number | null } | null;
  detailed_metrics?: {
    core?: { lcp?: { numericValue?: number }; inp?: { numericValue?: number }; cls?: { numericValue?: number } };
    load?: { tti?: { numericValue?: number } };
    blocking?: { tbt?: { numericValue?: number } };
  } | null;
}): RevenueStageSnapshot {
  const rev = data.revenueImpactInputs;
  const dm = data.detailed_metrics;

  const lcpMs = dm?.core?.lcp?.numericValue;
  const lcpSeconds =
    typeof lcpMs === "number" && Number.isFinite(lcpMs)
      ? lcpMs / 1000
      : typeof rev?.lcpSeconds === "number"
        ? rev.lcpSeconds
        : null;

  const inpMs = dm?.core?.inp?.numericValue ?? rev?.inpMs ?? null;
  const inpSeconds = typeof inpMs === "number" && Number.isFinite(inpMs) ? inpMs / 1000 : null;

  const tbtMs = dm?.blocking?.tbt?.numericValue;
  const tbtSeconds = typeof tbtMs === "number" && Number.isFinite(tbtMs) ? tbtMs / 1000 : null;

  const clsCore = dm?.core?.cls?.numericValue;
  const cls =
    typeof clsCore === "number" && Number.isFinite(clsCore)
      ? clsCore
      : typeof rev?.cls === "number"
        ? rev.cls
        : null;

  const ttiMs = dm?.load?.tti?.numericValue;
  const ttiSeconds = typeof ttiMs === "number" && Number.isFinite(ttiMs) ? ttiMs / 1000 : null;

  return { lcpSeconds, inpSeconds, tbtSeconds, cls, ttiSeconds };
}

/** Confidence sort: High first. */
const CONF_ORDER: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

/**
 * Sort key for priority fixes: stage weight (desc), revenue (desc), confidence (desc), effort (asc).
 */
export function priorityFixSortScore(
  primaryEngineKey: string,
  stageWeights: StageWeightTriple,
  item: { totalRevenueImpact: number; confidence: string; effortWeight: number }
): [number, number, number, number] {
  const stage = canonicalStageForEngineKey(primaryEngineKey);
  const w =
    stage === "Landing"
      ? stageWeights.landing
      : stage === "Activation"
        ? stageWeights.interaction
        : stageWeights.conversion;
  return [
    w,
    item.totalRevenueImpact,
    CONF_ORDER[item.confidence] ?? 0,
    -item.effortWeight,
  ];
}

export function comparePriorityFixes(
  a: { primaryEngineKey: string; totalRevenueImpact: number; confidence: string; effortWeight: number },
  b: { primaryEngineKey: string; totalRevenueImpact: number; confidence: string; effortWeight: number },
  stageWeights: StageWeightTriple
): number {
  const sa = priorityFixSortScore(a.primaryEngineKey, stageWeights, a);
  const sb = priorityFixSortScore(b.primaryEngineKey, stageWeights, b);
  for (let i = 0; i < sa.length; i++) {
    if (sb[i] !== sa[i]) return sb[i] - sa[i];
  }
  return a.primaryEngineKey.localeCompare(b.primaryEngineKey);
}
