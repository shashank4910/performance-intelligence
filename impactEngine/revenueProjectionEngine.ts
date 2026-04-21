/**
 * Deterministic revenue projection engine.
 * Range-based output only. Internal mapping: high/medium/low → influence strength.
 * No raw numeric sensitivity exposed. No single-point prediction.
 */

import type {
  PerformanceSnapshotLike,
  BusinessInputs,
  OpportunityRange,
  ImpactDriver,
  ConfidenceLevel,
  SensitivityLevel,
} from "./impactTypes";
import { getBusinessModel } from "./businessModelRegistry";
import { getFunnelTemplate } from "./funnelTemplates";
import { getSensitivityProfile } from "./sensitivityModels";
import {
  impactLCP as v2ImpactLCP,
  impactTBT as v2ImpactTBT,
  impactINP as v2ImpactINP,
  impactCLS as v2ImpactCLS,
} from "@/lib/impactEngine/v2BehaviorModel";

/** Internal only: qualitative level to influence factor (not exposed). */
const INFLUENCE_FACTOR: Record<string, { strong: number; moderate: number; weak: number }> = {
  high: { strong: 0.18, moderate: 0.14, weak: 0.10 },
  medium: { strong: 0.12, moderate: 0.08, weak: 0.05 },
  low: { strong: 0.06, moderate: 0.04, weak: 0.02 },
};

/** Normalize health 0–100 to a 0–1 gap-from-ideal (higher = more room to improve). */
function gapFromIdeal(health: number | null | undefined): number {
  if (health == null || Number.isNaN(health)) return 0.5;
  const h = Math.max(0, Math.min(100, health));
  return (100 - h) / 100;
}

/**
 * Map metric value to 0–1 impact.
 *
 * Reuses the V2 behavior model curves so this engine and `computeBehaviorRevenueImpact`
 * agree on units and thresholds (TBT/INP read in seconds from the snapshot, then
 * converted to ms before being fed into the V2 functions; threshold = 300ms / 200ms).
 */
function metricToImpact(metric: string, snapshot: PerformanceSnapshotLike): number {
  const lcpSec = snapshot.lcp != null ? snapshot.lcp : (snapshot as { lcpSeconds?: number }).lcpSeconds;
  switch (metric) {
    case "LCP":
      return typeof lcpSec === "number" ? v2ImpactLCP(lcpSec * 1000) : 0;
    case "TTI": {
      const ttiSec = snapshot.tti;
      if (typeof ttiSec === "number" && Number.isFinite(ttiSec) && ttiSec > 0) {
        return v2ImpactTBT(ttiSec * 1000);
      }
      return snapshot.tbt != null ? v2ImpactTBT(snapshot.tbt * 1000) : 0;
    }
    case "MainThread":
    case "TBT":
      return snapshot.tbt != null ? v2ImpactTBT(snapshot.tbt * 1000) : 0;
    case "INP":
      return snapshot.inp != null ? v2ImpactINP(snapshot.inp * 1000) : 0;
    case "CLS":
      return snapshot.cls != null ? v2ImpactCLS(snapshot.cls) : 0;
    case "TTFB":
      // TTFB doesn't have a dedicated V2 curve — reuse the TBT curve as an approximation
      // of "long server delay → frustration", with the same 300ms threshold for consistency.
      return snapshot.ttfb != null ? v2ImpactTBT(snapshot.ttfb * 1000) : 0;
    default:
      return gapFromIdeal(snapshot.overallHealth);
  }
}

/** Deterministic opportunity as a range (low, expected, high). No fake precision. */
function toOpportunityRange(amount: number): OpportunityRange {
  const round = (n: number) => Math.round(n);
  const low = Math.max(0, round(amount * 0.6));
  const expected = round(amount);
  const high = round(amount * 1.4);
  return { low, expected, high };
}

export type SensitivityMode = "conservative" | "balanced" | "aggressive";

const ELASTICITY_MULTIPLIER: Record<SensitivityMode, number> = {
  conservative: 0.75,
  balanced: 1.0,
  aggressive: 1.25,
};

export type RevenueProjectionInput = {
  performanceSnapshot: PerformanceSnapshotLike;
  businessInputs: BusinessInputs;
  businessModelId: string;
  sensitivityMode?: SensitivityMode;
};

export type RevenueProjectionResult = {
  baselineRevenue: number;
  optimizedRevenueRange: OpportunityRange;
  opportunityRange: OpportunityRange;
  confidenceLevel: ConfidenceLevel;
  primaryDrivers: ImpactDriver[];
  sensitivityModeUsed?: string;
};

export function runRevenueProjection(input: RevenueProjectionInput): RevenueProjectionResult {
  const { performanceSnapshot, businessInputs, businessModelId, sensitivityMode = "balanced" } = input;
  const model = getBusinessModel(businessModelId);
  const template = model ? getFunnelTemplate(model.funnelTemplateId) : undefined;
  const profile = model ? getSensitivityProfile(model.sensitivityProfileId) : undefined;

  const baselineRevenue = Math.max(0, Number(businessInputs.monthlyRevenue) || 0);
  const mobileWeight = Math.min(1, Math.max(0, (businessInputs.mobileTrafficPercent ?? 100) / 100));
  const effectiveBaseline = baselineRevenue * mobileWeight;

  if (!model || !template || !profile || effectiveBaseline <= 0) {
    return {
      baselineRevenue: Math.round(baselineRevenue),
      optimizedRevenueRange: { low: 0, expected: 0, high: 0 },
      opportunityRange: { low: 0, expected: 0, high: 0 },
      confidenceLevel: "low",
      primaryDrivers: [],
      sensitivityModeUsed: sensitivityMode,
    };
  }

  const elasticityMultiplier = ELASTICITY_MULTIPLIER[sensitivityMode];
  const healthGap = gapFromIdeal(performanceSnapshot.overallHealth);
  let totalInfluence = 0;
  const drivers: Array<{ metric: string; stage: string; influence: SensitivityLevel; score: number }> = [];

  for (const { stage, weight } of template.stages) {
    const stageSens = profile[stage];
    if (!stageSens) continue;
    for (const [metric, level] of Object.entries(stageSens)) {
      const impact = metricToImpact(metric, performanceSnapshot);
      const factors = INFLUENCE_FACTOR[level];
      const factor = factors ? factors.moderate : 0.05;
      const score = weight * impact * factor;
      totalInfluence += score;
      drivers.push({
        metric,
        stage,
        influence: level as SensitivityLevel,
        score,
      });
    }
  }

  totalInfluence = totalInfluence * elasticityMultiplier;

  drivers.sort((a, b) => b.score - a.score);
  const primaryDrivers: ImpactDriver[] = drivers.slice(0, 5).map((d) => ({
    metric: d.metric,
    stage: d.stage,
    influence: d.influence,
    description: `${d.metric} in ${d.stage} (${d.influence} influence)`,
  }));

  const cap = 0.35;
  const rawOpportunityPct = Math.min(cap, totalInfluence + healthGap * 0.08);
  const opportunityAmount = effectiveBaseline * rawOpportunityPct;
  const opportunityRange = toOpportunityRange(opportunityAmount);
  const optimizedRevenueRange: OpportunityRange = {
    low: Math.round(Math.max(0, effectiveBaseline - opportunityRange.high)),
    expected: Math.round(Math.max(0, effectiveBaseline - opportunityRange.expected)),
    high: Math.round(Math.max(0, effectiveBaseline - opportunityRange.low)),
  };

  let confidenceLevel: ConfidenceLevel = "moderate";
  if (baselineRevenue <= 0 || (performanceSnapshot.overallHealth == null)) confidenceLevel = "low";
  else if (primaryDrivers.length >= 2 && performanceSnapshot.overallHealth != null) confidenceLevel = "high";

  return {
    baselineRevenue: Math.round(baselineRevenue),
    optimizedRevenueRange,
    opportunityRange,
    confidenceLevel,
    primaryDrivers,
    sensitivityModeUsed: sensitivityMode,
  };
}
