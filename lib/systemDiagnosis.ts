/**
 * Builds structured system diagnosis input from stored analyze JSON (deterministic model output).
 * Plain copy: `presentSystemDiagnosis` in `systemDiagnosisPresentation.ts`.
 */

import type { MetricSeverity } from "@/lib/revenueStageDistribution";
import {
  computeStageMetricWeights,
  revenueStageSnapshotFromAnalyzeData,
  snapshotAxisSeverities,
} from "@/lib/revenueStageDistribution";
import type { DiagnosisBand, DiagnosisStage, SystemDiagnosisPresentationInput } from "@/lib/systemDiagnosisPresentation";

export type { DiagnosisBand, DiagnosisStage, SystemDiagnosisPresentationInput } from "@/lib/systemDiagnosisPresentation";
export { presentSystemDiagnosis } from "@/lib/systemDiagnosisPresentation";

function bandFromMetricSeverity(s: MetricSeverity): DiagnosisBand {
  if (s === "bad") return "high";
  if (s === "medium") return "medium";
  if (s === "good") return "low";
  return "medium";
}

/** When conversion share is clearly behind the other stages, dominant narrative stays earlier in the funnel. */
export function dominantStageFromImpacts(
  landingImpact: number,
  interactionImpact: number,
  conversionImpact: number
): DiagnosisStage {
  const L = Number.isFinite(landingImpact) ? Math.max(0, landingImpact) : 0;
  const I = Number.isFinite(interactionImpact) ? Math.max(0, interactionImpact) : 0;
  const C = Number.isFinite(conversionImpact) ? Math.max(0, conversionImpact) : 0;
  const maxAll = Math.max(L, I, C);
  if (C + 1e-9 < maxAll && C <= L && C <= I && (L > C || I > C)) {
    return L >= I ? "landing" : "interaction";
  }
  if (L >= I && L >= C) return "landing";
  if (I >= L && I >= C) return "interaction";
  return "conversion";
}

/** Second-strongest funnel share (for downstream use; presentation layer may ignore). */
export function secondaryStageFromWeights(L: number, I: number, C: number): DiagnosisStage {
  const triple: Array<{ stage: DiagnosisStage; w: number }> = [
    { stage: "landing", w: L },
    { stage: "interaction", w: I },
    { stage: "conversion", w: C },
  ];
  triple.sort((a, b) => b.w - a.w);
  return triple[1]?.stage ?? "interaction";
}

function confidenceBandFromAnalyze(data: {
  confidenceLevel?: string;
  summary?: { confidenceLevel?: string };
}): DiagnosisBand {
  const raw = (data.confidenceLevel ?? data.summary?.confidenceLevel ?? "Medium").toLowerCase();
  if (raw === "high") return "high";
  if (raw === "low") return "low";
  return "medium";
}

/**
 * Deterministic bridge from analyze-shaped payload → presentation input JSON.
 * Call `presentSystemDiagnosis` on the result for user-facing copy.
 */
export function buildSystemDiagnosisPresentationInputFromAnalyzeData(data: {
  estimatedMonthlyLeak?: number;
  revenueImpactInputs?: { lcpSeconds?: number; cls?: number; inpMs?: number | null } | null;
  detailed_metrics?: Record<string, unknown> | null;
  confidenceLevel?: string;
  summary?: { confidenceLevel?: string };
}): SystemDiagnosisPresentationInput {
  const snapshot = revenueStageSnapshotFromAnalyzeData(data);
  const w = computeStageMetricWeights(snapshot);
  const axes = snapshotAxisSeverities(snapshot);

  const L = w.landing;
  const I = w.interaction;
  const C = w.conversion;
  const dominantStage = dominantStageFromImpacts(L, I, C);

  return {
    dominantStage,
    secondaryStage: secondaryStageFromWeights(L, I, C),
    severity: {
      speed: bandFromMetricSeverity(axes.speed),
      interaction: bandFromMetricSeverity(axes.interaction),
      stability: bandFromMetricSeverity(axes.stability),
    },
    confidence: confidenceBandFromAnalyze(data),
  };
}
