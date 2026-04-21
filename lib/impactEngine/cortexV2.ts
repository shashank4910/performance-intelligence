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
 * CORTEX v2 — Stage-Based Multi-Curve Revenue Attribution Engine.
 * Pro-tier Behavioral Revenue Intelligence. Conservative, coherent, defensible.
 *
 * Revenue Loss Model:
 *   VPV = Revenue / Traffic
 *   TotalLeak = Traffic × VPV × FinalAbandonmentProbability = Revenue × FinalAbandonmentProbability
 *   FinalAbandonmentProbability = [1 − Π(1 − StageImpact_i)] × InfrastructureAmplifier
 *   Clamped to [0, 0.6].
 */

export type CortexStage =
  | "VISUAL_ENTRY"
  | "INTERACTION"
  | "TRUST"
  | "INFRASTRUCTURE";

type AuditMeta = {
  metricKey: string;
  stage: CortexStage;
  /** For VISUAL/INTERACTION: value in ms. For TRUST: CLS 0-1. For INFRASTRUCTURE: bytes or 0. */
  valueType: "ms" | "cls" | "bytes";
};

/** Every audit with score < 0.9 must be mapped to a stage. No cherry-picking. */
const CORTEX_AUDIT_CONFIG: Record<string, AuditMeta> = {
  "largest-contentful-paint": { metricKey: "lcp", stage: "VISUAL_ENTRY", valueType: "ms" },
  "first-contentful-paint": { metricKey: "fcp", stage: "VISUAL_ENTRY", valueType: "ms" },
  "speed-index": { metricKey: "speedIndex", stage: "VISUAL_ENTRY", valueType: "ms" },
  interactive: { metricKey: "tti", stage: "INTERACTION", valueType: "ms" },
  "total-blocking-time": { metricKey: "tbt", stage: "INTERACTION", valueType: "ms" },
  "interaction-to-next-paint": { metricKey: "inp", stage: "INTERACTION", valueType: "ms" },
  "long-tasks": { metricKey: "longTasks", stage: "INTERACTION", valueType: "ms" },
  "mainthread-work-breakdown": { metricKey: "mainThread", stage: "INTERACTION", valueType: "ms" },
  "bootup-time": { metricKey: "bootupTime", stage: "INTERACTION", valueType: "ms" },
  "cumulative-layout-shift": { metricKey: "cls", stage: "TRUST", valueType: "cls" },
  "unused-javascript": { metricKey: "unusedJs", stage: "INFRASTRUCTURE", valueType: "bytes" },
  "unused-css-rules": { metricKey: "unusedCss", stage: "INFRASTRUCTURE", valueType: "bytes" },
};

// ——— Curve parameters (conservative, no inflation) ———

const VISUAL_T_SEC = 2.8;
const VISUAL_K = 1.4;
const INTERACTION_A = 0.008;
const TRUST_M = 2.5;
const TRUST_CAP = 0.15;
const INFRA_B = 0.08;
const INFRA_BASELINE_KB = 500;
const FINAL_ABANDONMENT_CAP = 0.6;

/** 1) VISUAL ENTRY — Sigmoid. Impact = 1 / (1 + e^(-k(x - t))). x in seconds. */
function impactVisual(valueMs: number): number {
  if (!Number.isFinite(valueMs) || valueMs <= 0) return 0;
  const x = valueMs / 1000;
  const exp = Math.exp(-VISUAL_K * (x - VISUAL_T_SEC));
  return 1 / (1 + exp);
}

/** 2) INTERACTION — Exponential micro-friction. Impact = 1 - e^(-a * delay_ms). */
function impactInteraction(delayMs: number): number {
  if (!Number.isFinite(delayMs) || delayMs <= 0) return 0;
  return 1 - Math.exp(-INTERACTION_A * delayMs);
}

/** 3) TRUST — Capped linear. Impact = min(m * CLS_value, 0.15). */
function impactTrust(clsValue: number): number {
  if (!Number.isFinite(clsValue) || clsValue <= 0) return 0;
  return Math.min(TRUST_M * clsValue, TRUST_CAP);
}

/** 4) INFRASTRUCTURE AMPLIFIER — Log multiplier. 1 + b*log(payload_kb/baseline). */
function infrastructureAmplifier(payloadKb: number): number {
  if (!Number.isFinite(payloadKb) || payloadKb <= 0) return 1;
  const ratio = Math.max(payloadKb / INFRA_BASELINE_KB, 0.01);
  return 1 + INFRA_B * Math.log(ratio);
}

/** Stage impact = 1 − Π(1 − impact_per_metric) for metrics in that stage. */
function stageImpactFromList(impacts: number[]): number {
  const product = impacts
    .filter((p) => Number.isFinite(p) && p > 0)
    .reduce((acc, p) => acc * (1 - Math.min(1, p)), 1);
  return 1 - product;
}

export type CortexV2Input = {
  audits: Record<string, { numericValue?: number; score?: number | null }> | null | undefined;
  monthlyRevenue: number;
  /** Optional. If omitted, TotalLeak = monthlyRevenue × FinalAbandonment (equivalent to Traffic×VPV×FAP). */
  monthlyTraffic?: number;
};

export type CortexV2Result = {
  totalLeak: number;
  leakByMetric: Record<string, number>;
  diagnostic: {
    stageVisualImpact: number;
    stageInteractionImpact: number;
    stageTrustImpact: number;
    infrastructureAmplifier: number;
    finalAbandonmentProbability: number;
    sumResourceLeaks: number;
    equalityCheck: "PASS" | "FAIL";
  };
};

/**
 * CORTEX v2: Stage-based multi-curve attribution.
 * All underperforming audits (score < 0.9) are incorporated.
 * Σ(leakByMetric) === totalLeak (within 0.1%).
 */
export function computeCortexV2(input: CortexV2Input): CortexV2Result {
  const { audits, monthlyRevenue, monthlyTraffic } = input;
  const leakByMetric: Record<string, number> = {};
  const diagnostic = {
    stageVisualImpact: 0,
    stageInteractionImpact: 0,
    stageTrustImpact: 0,
    infrastructureAmplifier: 1,
    finalAbandonmentProbability: 0,
    sumResourceLeaks: 0,
    equalityCheck: "PASS" as "PASS" | "FAIL",
  };

  if (!audits || typeof audits !== "object" || monthlyRevenue <= 0) {
    return { totalLeak: 0, leakByMetric, diagnostic };
  }

  const visualImpacts: number[] = [];
  const interactionImpacts: number[] = [];
  const trustImpacts: number[] = [];

  /** Underperforming metrics with their raw impact (for allocation weight). */
  const metricImpacts: { metricKey: string; impact: number }[] = [];

  let payloadBytes = 0;
  const totalByteWeight = audits["total-byte-weight"]?.numericValue;
  if (typeof totalByteWeight === "number" && Number.isFinite(totalByteWeight)) {
    payloadBytes = totalByteWeight;
  }

  for (const auditId of Object.keys(audits)) {
    const entry = CORTEX_AUDIT_CONFIG[auditId];
    if (!entry) continue;
    const audit = audits[auditId];
    const score = audit?.score;
    if (score == null || typeof score !== "number" || score >= 0.9) continue;
    const raw = audit?.numericValue;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;

    let impact = 0;
    if (entry.stage === "VISUAL_ENTRY" && entry.valueType === "ms") {
      impact = impactVisual(raw);
      if (impact > 0) visualImpacts.push(impact);
    } else if (entry.stage === "INTERACTION" && entry.valueType === "ms") {
      impact = impactInteraction(raw);
      if (impact > 0) interactionImpacts.push(impact);
    } else if (entry.stage === "TRUST" && entry.valueType === "cls") {
      impact = impactTrust(raw);
      if (impact > 0) trustImpacts.push(impact);
    } else if (entry.stage === "INFRASTRUCTURE" && entry.valueType === "bytes") {
      impact = 0;
      const kb = raw / 1024;
      if (kb > 0) {
        impact = Math.min(1, Math.log(1 + kb / 500) * 0.15);
      }
    }
    if (impact > 0) {
      metricImpacts.push({ metricKey: entry.metricKey, impact });
    }
  }

  const stageVisualImpact = stageImpactFromList(visualImpacts);
  const stageInteractionImpact = stageImpactFromList(interactionImpacts);
  const stageTrustImpact = stageImpactFromList(trustImpacts);
  diagnostic.stageVisualImpact = stageVisualImpact;
  diagnostic.stageInteractionImpact = stageInteractionImpact;
  diagnostic.stageTrustImpact = stageTrustImpact;

  const baseAbandonment =
    1 -
    (1 - stageVisualImpact) * (1 - stageInteractionImpact) * (1 - stageTrustImpact);
  const payloadKb = payloadBytes / 1024;
  const amplifier = infrastructureAmplifier(payloadKb);
  diagnostic.infrastructureAmplifier = amplifier;

  let finalAbandonment = baseAbandonment * amplifier;
  finalAbandonment = Math.max(0, Math.min(FINAL_ABANDONMENT_CAP, finalAbandonment));
  diagnostic.finalAbandonmentProbability = finalAbandonment;

  const totalLeak =
    monthlyTraffic != null && monthlyTraffic > 0
      ? monthlyTraffic * (monthlyRevenue / monthlyTraffic) * finalAbandonment
      : monthlyRevenue * finalAbandonment;
  const totalLeakRounded = Math.round(totalLeak * 100) / 100;

  if (metricImpacts.length === 0 || totalLeakRounded <= 0) {
    diagnostic.sumResourceLeaks = 0;
    return { totalLeak: totalLeakRounded, leakByMetric, diagnostic };
  }

  const totalImpact = metricImpacts.reduce((s, m) => s + m.impact, 0);
  if (totalImpact <= 0) {
    diagnostic.sumResourceLeaks = 0;
    return { totalLeak: totalLeakRounded, leakByMetric, diagnostic };
  }

  const totalCents = Math.round(totalLeakRounded * 100);
  const centsPerMetric = metricImpacts.map((m) =>
    Math.floor((totalCents * m.impact) / totalImpact)
  );
  let assigned = centsPerMetric.reduce((s, c) => s + c, 0);
  let remainder = totalCents - assigned;
  if (remainder > 0) {
    const byFraction = metricImpacts
      .map((m, i) => ({ i, frac: (totalCents * m.impact) / totalImpact - centsPerMetric[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remainder && k < byFraction.length; k++) {
      centsPerMetric[byFraction[k].i] += 1;
    }
  }
  metricImpacts.forEach((m, i) => {
    leakByMetric[m.metricKey] = centsPerMetric[i] / 100;
  });

  const sumResourceLeaks = Object.values(leakByMetric).reduce((a, b) => a + b, 0);
  diagnostic.sumResourceLeaks = sumResourceLeaks;
  const mismatchPct = Math.abs(sumResourceLeaks - totalLeakRounded) / Math.max(totalLeakRounded, 1);
  if (mismatchPct > 0.001) {
    diagnostic.equalityCheck = "FAIL";
    if (typeof process !== "undefined") {
      console.warn("CORTEX v2: Σ(resourceLeaks) !== TotalLeak. Mismatch > 0.1%");
    }
  }

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("--- CORTEX V2 DIAGNOSTIC ---");
    console.log("TotalLeak:", totalLeakRounded);
    console.log("SumResourceLeaks:", sumResourceLeaks);
    console.log("Equality check:", diagnostic.equalityCheck);
    console.log("StageVisualImpact:", stageVisualImpact);
    console.log("StageInteractionImpact:", stageInteractionImpact);
    console.log("StageTrustImpact:", stageTrustImpact);
    console.log("Amplifier:", amplifier);
  }

  return { totalLeak: totalLeakRounded, leakByMetric, diagnostic };
}

/** Stage label for narratives. */
export function getStageLabel(stage: CortexStage): string {
  const labels: Record<CortexStage, string> = {
    VISUAL_ENTRY: "Visual Entry",
    INTERACTION: "Interaction",
    TRUST: "Trust / Stability",
    INFRASTRUCTURE: "Infrastructure",
  };
  return labels[stage];
}
