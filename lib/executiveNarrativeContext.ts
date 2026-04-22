/**
 * System-level narrative mode for the executive summary (business decision system, not alarm UI).
 */

import type { AnalyzeLikePayload } from "@/lib/aiExecutiveSummary";
import { buildPrimaryConstraintPresentationInputFromAnalyzeData } from "@/lib/primaryConstraint";
import { strongestConstraintAxis } from "@/lib/primaryConstraintPresentation";
import {
  computeStageMetricWeights,
  revenueStageSnapshotFromAnalyzeData,
} from "@/lib/revenueStageDistribution";
import { dominantStageFromImpacts } from "@/lib/systemDiagnosis";
import { getRevenueRiskLevel } from "@/lib/riskEngine";

const METRIC_TOKENS = /\b(lcp|inp|cls|tbt|tti|fcp|fid|si|ttfb|cwv|psi)\b/gi;

function sanitizeSignalLine(raw: string): string {
  return raw
    .replace(/\d[\d.,]*/g, "")
    .replace(/%/g, "")
    .replace(/\bms\b/gi, "")
    .replace(METRIC_TOKENS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same semantics as `contributingSignalsFromFixPriorities` (kept local to avoid import cycles). */
const CATEGORY_CONTRIBUTION: Record<string, string> = {
  speed: "the first load path is where stress shows up strongest",
  ux: "how the page responds to input is where stress shows up strongest",
  seo: "discovery and visibility are carrying extra risk",
  conversion: "momentum toward completion is carrying extra risk",
  scaling: "growth and traffic are likely to add stress",
};

function contributingSignalsLocal(
  fixPriorities: AnalyzeLikePayload["fix_priorities"]
): string[] {
  if (!Array.isArray(fixPriorities) || fixPriorities.length === 0) return [];
  const out: string[] = [];
  for (const row of fixPriorities.slice(0, 3)) {
    const cat = typeof row?.category === "string" ? row.category.toLowerCase() : "";
    const line = CATEGORY_CONTRIBUTION[cat];
    if (line) {
      const cleaned = sanitizeSignalLine(line);
      if (cleaned) out.push(cleaned);
    }
  }
  return out.slice(0, 3);
}

export type NarrativeMode = "POSITIVE" | "BALANCED" | "NEGATIVE";

export type RevenueExposureLevel = "LOW" | "MEDIUM" | "HIGH";

export type PerformanceNarrativeModeInput = {
  overall_health_score: number;
  revenue_exposure_level: RevenueExposureLevel;
  dominant_stage: "load" | "interaction" | "conversion";
  worst_metric_group: "speed" | "interaction" | "stability";
};

export function getPerformanceNarrativeMode(
  input: PerformanceNarrativeModeInput
): { narrative_mode: NarrativeMode } {
  const h = input.overall_health_score;
  const e = input.revenue_exposure_level;
  if (h >= 7.5 && e !== "HIGH") {
    return { narrative_mode: "POSITIVE" };
  }
  if (h >= 5 && h < 7.5) {
    return { narrative_mode: "BALANCED" };
  }
  return { narrative_mode: "NEGATIVE" };
}

export const NARRATIVE_RULES = {
  POSITIVE: {
    tone: "reassuring",
    allow_urgency: false as const,
    allow_revenue_leak_language: false as const,
    focus: ["what_is_working", "minor_friction", "non_urgent"],
  },
  BALANCED: {
    tone: "neutral",
    allow_urgency: "limited" as const,
    allow_revenue_leak_language: "conditional" as const,
    focus: ["mixed_performance", "clear_tradeoffs"],
  },
  NEGATIVE: {
    tone: "urgent",
    allow_urgency: true as const,
    allow_revenue_leak_language: true as const,
    focus: ["clear_problems", "business_risk", "what_to_fix"],
  },
} as const;

export type ExecutiveNarrativeContext = {
  mode: NarrativeMode;
  overall_health_score: number;
  revenue_exposure_level: RevenueExposureLevel;
  dominant_stage: "load" | "interaction" | "conversion";
  worst_metric_group: "speed" | "interaction" | "stability";
  contributing_signals: string[];
  strengths: string[];
  weaknesses: string[];
  business_impact_level?: string;
  /** Rules blob for prompts (serializable). */
  narrative_rules: (typeof NARRATIVE_RULES)[NarrativeMode];
};

export type DashboardMetricNarrative = {
  metricKey: string;
  label: string;
  verdict: string;
};

export function mapRevenueRiskScoreToExposureLevel(score: number): RevenueExposureLevel {
  const band = getRevenueRiskLevel(score);
  if (band === "Critical" || band === "High") return "HIGH";
  if (band === "Moderate") return "MEDIUM";
  return "LOW";
}

function mapDominantToLoadInteractionConversion(
  stage: "landing" | "interaction" | "conversion"
): "load" | "interaction" | "conversion" {
  if (stage === "landing") return "load";
  return stage;
}

const STRENGTH_PHRASES: Partial<Record<string, string>> = {
  "core-lcp": "Important content shows up without long waits for most visitors.",
  "core-cls": "The page tends to stay visually steady as people read and scroll.",
  "core-inp": "Taps and scrolling usually feel responsive enough for real use.",
  "core-fcp": "The first paint arrives quickly enough that the page feels alive.",
  "load-speedIndex": "The page settles into a usable state at a reasonable pace.",
  "load-tti": "The page becomes interactive without excessive delay.",
  "load-ttfb": "The server answers quickly enough that nothing feels stuck at the start.",
  "blocking-tbt": "Main-thread blocking stays within a tolerable range.",
  "blocking-mainThread": "Main-thread work stays within a tolerable range.",
  "blocking-longTasks": "Long tasks are not dominating the experience.",
  "blocking-bootupTime": "Script startup stays within a tolerable range.",
  "backend-totalBytes": "Payload size is under control for typical visits.",
  "backend-unusedJs": "JavaScript overhead is not the dominant drag.",
  "backend-unusedCss": "Style overhead is not the dominant drag.",
  "backend-serverResponse": "Backend response time is not the dominant drag.",
  "backend-networkRequests": "Request volume is not spiraling out of control.",
};

const WEAKNESS_PHRASES: Partial<Record<string, string>> = {
  "core-lcp": "First meaningful content still feels slow for a meaningful slice of visits.",
  "core-cls": "Layout shifts can still unsettle people during reading and scrolling.",
  "core-inp": "Interaction can still feel sticky during taps and scrolling.",
  "core-fcp": "The first paint can still feel late on slower paths.",
  "load-speedIndex": "The page can still feel sluggish while it is settling.",
  "load-tti": "Time-to-interactive can still leave people waiting.",
  "load-ttfb": "Server response can still be a noticeable bottleneck at the start.",
  "blocking-tbt": "Main-thread blocking is still eating into engagement.",
  "blocking-mainThread": "Main-thread work is still heavy enough to matter.",
  "blocking-longTasks": "Long tasks are still interrupting flow.",
  "blocking-bootupTime": "Script startup is still heavier than it should be.",
  "backend-totalBytes": "Payload size is still large enough to slow people down.",
  "backend-unusedJs": "Unused JavaScript is still adding avoidable cost.",
  "backend-unusedCss": "Unused CSS is still adding avoidable cost.",
  "backend-serverResponse": "Backend latency is still a drag on perceived speed.",
  "backend-networkRequests": "Too many network requests still add overhead.",
};

function strengthsFromMetrics(rows: DashboardMetricNarrative[] | null | undefined): string[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const out: string[] = [];
  for (const row of rows) {
    if (row.verdict !== "Good") continue;
    const line = STRENGTH_PHRASES[row.metricKey];
    if (line) out.push(line);
    if (out.length >= 4) break;
  }
  return out;
}

function weaknessesFromMetrics(rows: DashboardMetricNarrative[] | null | undefined): string[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const out: string[] = [];
  for (const row of rows) {
    if (row.verdict !== "Poor" && row.verdict !== "Needs Improvement") continue;
    const line = WEAKNESS_PHRASES[row.metricKey];
    if (line) out.push(line);
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Structured context for the executive narrative: mode is decided by the engine, not the LLM.
 */
export function buildExecutiveNarrativeContext(params: {
  overallHealth100: number;
  revenueRiskScore: number;
  data: AnalyzeLikePayload;
  metricsForDashboard?: DashboardMetricNarrative[] | null;
  businessImpactLevel?: string | null;
}): ExecutiveNarrativeContext {
  const snapshot = revenueStageSnapshotFromAnalyzeData(
    params.data as Parameters<typeof revenueStageSnapshotFromAnalyzeData>[0]
  );
  const w = computeStageMetricWeights(snapshot);
  const dominantStageRaw = dominantStageFromImpacts(w.landing, w.interaction, w.conversion);
  const primary = buildPrimaryConstraintPresentationInputFromAnalyzeData(
    params.data as Parameters<typeof buildPrimaryConstraintPresentationInputFromAnalyzeData>[0]
  );
  const worst_metric_group = strongestConstraintAxis(primary);
  const dominant_stage = mapDominantToLoadInteractionConversion(dominantStageRaw);
  const contributing_signals = contributingSignalsLocal(params.data.fix_priorities);

  const sev = primary.severity;
  const rk = { low: 1, medium: 2, high: 3 } as const;
  const m = Math.max(rk[sev.speed], rk[sev.interaction], rk[sev.stability]);
  const overallSeverityKind = m <= 1 ? "low" : m === 2 ? "medium" : "high";

  let strengths = strengthsFromMetrics(params.metricsForDashboard ?? null);
  let weaknesses = weaknessesFromMetrics(params.metricsForDashboard ?? null);

  const signals = contributing_signals;
  if (weaknesses.length === 0 && signals.length > 0) {
    weaknesses = signals.slice(0, 3).map((s) => `Watch this signal in the journey: ${s}`);
  }
  if (strengths.length === 0 && (params.overallHealth100 >= 70 || overallSeverityKind === "low")) {
    strengths = ["Overall performance sits in a healthy band for most real visits."];
  }
  if (weaknesses.length === 0) {
    weaknesses = ["There are still a few polish points worth tightening over time."];
  }

  const overall_health_score = Math.min(10, Math.max(0, params.overallHealth100 / 10));
  const revenue_exposure_level = mapRevenueRiskScoreToExposureLevel(params.revenueRiskScore);
  const { narrative_mode } = getPerformanceNarrativeMode({
    overall_health_score,
    revenue_exposure_level,
    dominant_stage,
    worst_metric_group,
  });

  return {
    mode: narrative_mode,
    narrative_rules: NARRATIVE_RULES[narrative_mode],
    overall_health_score,
    revenue_exposure_level,
    dominant_stage,
    worst_metric_group,
    contributing_signals,
    strengths,
    weaknesses,
    business_impact_level: params.businessImpactLevel ?? undefined,
  };
}

const POSITIVE_REINFORCEMENT =
  /\b(smooth|stable|solid|healthy|strong|strengths?|works well|working well|reassuring|steady|reliable|comfortable|calm|without major|minimal friction|in good shape|performs well|responsive enough|reasonable pace|timely|healthy band|mixed)\b/i;

const STRONG_NEGATIVE =
  /\b(serious|critical issue|catastrophic|disastrous|severe problem|urgent crisis|alarming|users are dropping|revenue leak|serious revenue|needs immediate attention|immediate attention)\b/i;

const IMPACT_NEGATIVE =
  /\b(risk|friction|hurt|hurting|problem|bottleneck|slow|blocking|leak|losing|drop\b|drops\b|degraded|weak|issue|cost|impact|hesitat|abandon|waste|drag|strain|pressure|constraint)\b/i;

export type NarrativeConsistencyResult = { ok: true } | { ok: false; reason: string };

/**
 * Runtime gate so POSITIVE mode cannot ship alarmist copy, and NEGATIVE mode must acknowledge impact.
 */
export function validateNarrativeConsistency(
  summary: string,
  context: ExecutiveNarrativeContext
): NarrativeConsistencyResult {
  const t = summary.trim();
  if (!t) return { ok: false, reason: "empty" };

  if (context.mode === "POSITIVE") {
    if (STRONG_NEGATIVE.test(t)) {
      return { ok: false, reason: "positive_mode_strong_negative" };
    }
    if (!POSITIVE_REINFORCEMENT.test(t)) {
      return { ok: false, reason: "positive_mode_missing_reinforcement" };
    }
    return { ok: true };
  }

  if (context.mode === "NEGATIVE") {
    if (!IMPACT_NEGATIVE.test(t)) {
      return { ok: false, reason: "negative_mode_missing_impact" };
    }
    return { ok: true };
  }

  // BALANCED
  if (/\bserious revenue leak\b/i.test(t)) {
    return { ok: false, reason: "balanced_mode_leak_language" };
  }
  if (!POSITIVE_REINFORCEMENT.test(t) && !IMPACT_NEGATIVE.test(t)) {
    return { ok: false, reason: "balanced_mode_too_vague" };
  }
  return { ok: true };
}
