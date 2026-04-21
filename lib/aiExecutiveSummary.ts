/**
 * Deterministic "executive summary" copy from shared Revenue Impact / funnel signals.
 * No LLMs, no metric names, no numbers — see product rules in task spec + docs/AI_CONTEXT.md.
 */

import { opportunityBoundsFromLoss, type SensitivityMode } from "@/lib/revenueImpactSensitivityMath";
import { computeStageMetricWeights, revenueStageSnapshotFromAnalyzeData } from "@/lib/revenueStageDistribution";
import { dominantStageFromImpacts } from "@/lib/systemDiagnosis";
import { buildPrimaryConstraintPresentationInputFromAnalyzeData } from "@/lib/primaryConstraint";
import { strongestConstraintAxis } from "@/lib/primaryConstraintPresentation";
import { dominantStageFromLeakByMetric } from "@/lib/revenueStabilityMonitoring";

export type DominantStageKind = "landing" | "interaction" | "conversion";
export type WorstMetricGroupKind = "speed" | "interaction" | "stability";
export type OverallSeverityKind = "low" | "medium" | "high";

export type ExecutiveSummaryJson = {
  headline: string;
  impact: string;
  constraint: string;
  action: string;
};

export type ExecutiveSummaryInput = {
  dominantStage: DominantStageKind;
  revenueImpact: {
    min: number;
    max: number;
    stageDistribution: { landing: number; interaction: number; conversion: number };
  };
  worstMetricGroup: WorstMetricGroupKind;
  overallSeverity: OverallSeverityKind;
  /** Sanitized lines only — max three; must come from upstream signals (e.g. ranked fix categories). */
  contributingSignals: string[];
};

export type ExecutiveSummaryResult =
  | { ok: true; json: ExecutiveSummaryJson }
  | { ok: false; error: string };

const METRIC_TOKENS = /\b(lcp|inp|cls|tbt|tti|fcp|fid|si|ttfb|cwv|psi)\b/gi;

/** Remove digits, percents, and common metric tokens from human lines. */
export function sanitizeExecutiveSummaryLine(raw: string): string {
  return raw
    .replace(/\d[\d.,]*/g, "")
    .replace(/%/g, "")
    .replace(/\bms\b/gi, "")
    .replace(METRIC_TOKENS, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hashPick(parts: string[], index: number, options: string[]): string {
  const key = `${parts.join("|")}|${index}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return options[h % options.length]!;
}

function assertNoBannedContent(parts: ExecutiveSummaryJson): string | null {
  const joined = `${parts.headline} ${parts.impact} ${parts.constraint} ${parts.action}`;
  if (/\d/.test(joined)) return "executive summary text must not contain numbers";
  const bannedPhrases = [
    /optimize performance/i,
    /leverage improvements/i,
    /based on analysis/i,
    /it appears that/i,
    /in order to\b/i,
  ];
  for (const b of bannedPhrases) {
    if (b.test(joined)) return "executive summary contains banned phrasing";
  }
  if (METRIC_TOKENS.test(joined)) return "executive summary must not name lab metrics";
  const lineCount = [parts.headline, parts.impact, parts.constraint, parts.action].filter(Boolean).join("\n").split("\n").length;
  if (lineCount > 5) return "executive summary is too long";
  return null;
}

function overallSeverityFromBands(bands: {
  speed: "low" | "medium" | "high";
  interaction: "low" | "medium" | "high";
  stability: "low" | "medium" | "high";
}): OverallSeverityKind {
  const ranks = { low: 1, medium: 2, high: 3 };
  const m = Math.max(
    ranks[bands.speed],
    ranks[bands.interaction],
    ranks[bands.stability]
  );
  if (m <= 1) return "low";
  if (m === 2) return "medium";
  return "high";
}

/** Plain phrases for `fix_priorities[].category` — derived from the risk engine, not invented causes. */
const CATEGORY_CONTRIBUTION: Record<string, string> = {
  speed: "the first load path is where stress shows up strongest",
  ux: "how the page responds to input is where stress shows up strongest",
  seo: "discovery and visibility are carrying extra risk",
  conversion: "momentum toward completion is carrying extra risk",
  scaling: "growth and traffic are likely to add stress",
};

/** Ranked category lines for founder-facing copy (engine categories only). */
export function contributingSignalsFromFixPriorities(
  fixPriorities: Array<{ category?: string }> | null | undefined
): string[] {
  if (!Array.isArray(fixPriorities) || fixPriorities.length === 0) return [];
  const out: string[] = [];
  for (const row of fixPriorities.slice(0, 3)) {
    const cat = typeof row?.category === "string" ? row.category.toLowerCase() : "";
    const line = CATEGORY_CONTRIBUTION[cat];
    if (line) {
      const cleaned = sanitizeExecutiveSummaryLine(line);
      if (cleaned) out.push(cleaned);
    }
  }
  return out.slice(0, 3);
}

export type AnalyzeLikePayload = {
  estimatedMonthlyLeak?: number;
  leak_by_metric?: Record<string, number> | null;
  revenueImpactInputs?: { lcpSeconds?: number; cls?: number; inpMs?: number | null } | null;
  detailed_metrics?: Record<string, unknown> | null;
  fix_priorities?: Array<{ category?: string; score?: number; priority?: string }> | null;
  /** Monthly revenue baseline when present (same sources as headline leak). */
  baselineRevenueForCompetitorAnalysis?: number;
};

/**
 * Builds strict inputs from stored / API analyze JSON using the same funnel weights as Revenue Impact.
 */
export function buildExecutiveSummaryInputFromAnalyzeData(
  data: AnalyzeLikePayload,
  options?: { baselineRevenue?: number; sensitivityMode?: SensitivityMode }
): ExecutiveSummaryInput {
  const snapshot = revenueStageSnapshotFromAnalyzeData(data as Parameters<typeof revenueStageSnapshotFromAnalyzeData>[0]);
  const w = computeStageMetricWeights(snapshot);
  const primary = buildPrimaryConstraintPresentationInputFromAnalyzeData(
    data as Parameters<typeof buildPrimaryConstraintPresentationInputFromAnalyzeData>[0]
  );

  const landing = w.landing;
  const interaction = w.interaction;
  const conversion = w.conversion;
  const dominantStage = dominantStageFromImpacts(landing, interaction, conversion);

  const worstMetricGroup = strongestConstraintAxis(primary);
  const overallSeverity = overallSeverityFromBands(primary.severity);

  const leak = typeof data.estimatedMonthlyLeak === "number" && Number.isFinite(data.estimatedMonthlyLeak)
    ? data.estimatedMonthlyLeak
    : 0;
  const baseline =
    options?.baselineRevenue ??
    (typeof data.baselineRevenueForCompetitorAnalysis === "number" && Number.isFinite(data.baselineRevenueForCompetitorAnalysis)
      ? data.baselineRevenueForCompetitorAnalysis
      : 0);
  const mode: SensitivityMode = options?.sensitivityMode ?? "balanced";
  const { opportunityLow, opportunityHigh } = opportunityBoundsFromLoss(leak, baseline, mode);

  const signals = contributingSignalsFromFixPriorities(data.fix_priorities);

  return {
    dominantStage,
    revenueImpact: {
      min: opportunityLow,
      max: opportunityHigh,
      stageDistribution: {
        landing,
        interaction,
        conversion,
      },
    },
    worstMetricGroup,
    overallSeverity,
    contributingSignals: signals,
  };
}

/**
 * If leak-dollar dominant stage and funnel-weight dominant stage disagree, log a warning.
 * Revenue Impact and this copy use funnel weights; monitoring snapshots still record leak-dollar labels.
 */
export function logExecutiveSummaryStageDrift(data: AnalyzeLikePayload, funnelDominant: DominantStageKind): void {
  const fromLeak = dominantStageFromLeakByMetric(data.leak_by_metric);
  if (fromLeak !== funnelDominant) {
    console.warn("[executive-summary] Dominant stage differs between leak dollars and funnel weights", {
      fromLeak,
      funnelDominant,
    });
  }
}

function assertExecutiveSummaryInputAligned(
  data: AnalyzeLikePayload,
  built: ExecutiveSummaryInput
): boolean {
  const primary = buildPrimaryConstraintPresentationInputFromAnalyzeData(
    data as Parameters<typeof buildPrimaryConstraintPresentationInputFromAnalyzeData>[0]
  );
  const w = strongestConstraintAxis(primary);
  const d = dominantStageFromImpacts(
    primary.impactWeights.landing,
    primary.impactWeights.interaction,
    primary.impactWeights.conversion
  );
  return w === built.worstMetricGroup && d === built.dominantStage;
}

function dropLine(stage: DominantStageKind, parts: string[]): string {
  const o = [
    "People leave before the first screen feels ready.",
    "Many visitors exit before they really see what you offer.",
    "The first moments on the page are losing people.",
  ];
  const i = [
    "People try to use the site, but flow feels slow or stuck.",
    "Engagement drops because responses to taps and scrolls feel sluggish.",
    "Usage feels heavier than it should when people try to move around.",
  ];
  const c = [
    "People hesitate or stop before they complete important actions.",
    "Drop-off shows up late in the journey, right before completion.",
    "Finish-line actions feel uncertain, so people stall or leave.",
  ];
  if (stage === "landing") return hashPick(parts, 0, o);
  if (stage === "interaction") return hashPick(parts, 0, i);
  return hashPick(parts, 0, c);
}

function causeFragment(group: WorstMetricGroupKind, parts: string[]): string {
  if (group === "speed") return hashPick(parts, 1, ["slow loading", "slow first paint", "heavy initial load"]);
  if (group === "interaction")
    return hashPick(parts, 1, ["slow or unresponsive interactions", "input that lags behind people", "touch and scroll lag"]);
  return hashPick(parts, 1, ["an unstable page feel", "content that shifts and breaks focus", "trust issues when content jumps"]);
}

function severityTone(sev: OverallSeverityKind): "soft" | "firm" | "sharp" {
  if (sev === "low") return "soft";
  if (sev === "medium") return "firm";
  return "sharp";
}

function buildHeadline(input: ExecutiveSummaryInput, parts: string[]): string {
  const drop = dropLine(input.dominantStage, parts);
  const cause = causeFragment(input.worstMetricGroup, parts);
  const hb = `${drop} ${hashPick(parts, 2, ["That ties to", "That lines up with", "That tracks with"])} ${cause}.`;
  const sigs = input.contributingSignals;
  if (sigs.length === 0) return hb;
  const extra = hashPick(parts, 3, [
    `Another strong signal is ${sigs[0]}.`,
    `Right now, ${sigs[0]}.`,
    `${sigs[0]}.`,
  ]);
  return `${hb} ${extra}`.replace(/\s+/g, " ").trim();
}

function buildImpact(input: ExecutiveSummaryInput, parts: string[]): string {
  const tone = severityTone(input.overallSeverity);
  if (tone === "soft") {
    return hashPick(parts, 4, [
      "Revenue is not a side issue here; friction is quietly trimming outcomes.",
      "This is subtle on the surface, but it can quietly cap results.",
      "Even small friction here shows up in the business outcome.",
    ]);
  }
  if (tone === "firm") {
    return hashPick(parts, 4, [
      "This is trimming revenue in a way owners feel on weekly numbers.",
      "Money is leaking in a steady, avoidable way.",
      "The business leaves real dollars on the table while this stays open.",
    ]);
  }
  return hashPick(parts, 4, [
    "This is a serious revenue leak while it stays unaddressed.",
    "The downside is material until the main bottleneck is fixed.",
    "This is one of those issues that quickly becomes expensive if ignored.",
  ]);
}

function buildConstraint(input: ExecutiveSummaryInput, parts: string[]): string {
  const g = input.worstMetricGroup;
  const d = input.dominantStage;
  if (g === "speed") {
    if (d === "landing")
      return hashPick(parts, 5, [
        "First-screen speed is the main bottleneck.",
        "Slow loading at the entry is the main bottleneck.",
      ]);
    if (d === "interaction")
      return hashPick(parts, 5, [
        "Slow loading is still blocking smooth flow.",
        "Heavy loading undermines later steps.",
      ]);
    return hashPick(parts, 5, [
      "Slow loading weakens confidence near completion.",
      "Speed debt shows up strongest at the finish.",
    ]);
  }
  if (g === "interaction") {
    if (d === "landing")
      return hashPick(parts, 5, [
        "Early interactions already feel laggy.",
        "Responsiveness at the start is the main drag.",
      ]);
    if (d === "interaction")
      return hashPick(parts, 5, [
        "Interaction responsiveness is the main bottleneck.",
        "Input lag is the main bottleneck.",
      ]);
    return hashPick(parts, 5, [
      "Late-step interactions are the main bottleneck.",
      "Sluggish responses near completion hurt trust.",
    ]);
  }
  if (d === "conversion")
    return hashPick(parts, 5, [
      "Unstable moments near completion are the main bottleneck.",
      "Page instability near completion is the main bottleneck.",
    ]);
  if (d === "interaction")
    return hashPick(parts, 5, [
      "Unstable feel mid-flow is the main bottleneck.",
      "Uneven stability while people engage is the main bottleneck.",
    ]);
  return hashPick(parts, 5, [
    "Unstable first impressions are the main bottleneck.",
    "Early instability is the main bottleneck.",
  ]);
}

function buildAction(input: ExecutiveSummaryInput, parts: string[]): string {
  const d = input.dominantStage;
  if (d === "landing")
    return hashPick(parts, 6, [
      "Start by making the first screen calm and fast so people actually arrive.",
      "Focus first on the entry path so people stay long enough to care.",
    ]);
  if (d === "interaction")
    return hashPick(parts, 6, [
      "Start by making taps and scrolls feel immediate so flow feels light.",
      "Focus first on responsiveness so usage feels effortless.",
    ]);
  return hashPick(parts, 6, [
    "Start by reducing hesitation at the final steps so completion feels safe.",
    "Focus first on completion steps so people trust the outcome.",
  ]);
}

/**
 * Produce four short Plain-English lines.
 */
export function generateExecutiveSummaryJson(
  data: AnalyzeLikePayload,
  options?: { baselineRevenue?: number; sensitivityMode?: SensitivityMode }
): ExecutiveSummaryResult {
  const built = buildExecutiveSummaryInputFromAnalyzeData(data, options);

  logExecutiveSummaryStageDrift(data, built.dominantStage);

  if (!assertExecutiveSummaryInputAligned(data, built)) {
    console.error("Executive summary mismatch with system state", { reason: "funnel_vs_primary_constraint" });
    return { ok: false, error: "Executive summary mismatch with system state" };
  }

  const parts = [
    built.dominantStage,
    built.worstMetricGroup,
    built.overallSeverity,
    built.contributingSignals.join(","),
  ];

  let json: ExecutiveSummaryJson = {
    headline: buildHeadline(built, parts),
    impact: buildImpact(built, parts),
    constraint: buildConstraint(built, parts),
    action: buildAction(built, parts),
  };

  json = {
    headline: sanitizeExecutiveSummaryLine(json.headline),
    impact: sanitizeExecutiveSummaryLine(json.impact),
    constraint: sanitizeExecutiveSummaryLine(json.constraint),
    action: sanitizeExecutiveSummaryLine(json.action),
  };

  const banned = assertNoBannedContent(json);
  if (banned) {
    console.error("Executive summary generation failed validation", { banned });
    return { ok: false, error: "Executive summary mismatch with system state" };
  }

  if (
    json.headline.length < 12 ||
    json.impact.length < 12 ||
    json.constraint.length < 12 ||
    json.action.length < 12
  ) {
    console.error("Executive summary mismatch with system state", { reason: "empty_or_too_short" });
    return { ok: false, error: "Executive summary mismatch with system state" };
  }

  return { ok: true, json };
}
