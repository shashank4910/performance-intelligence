import { pickSnapshotSummaryLine, pickWhyItMattersPhrase } from "@/lib/competitorPhrasePools";

export type CompetitorAnalysisMode = "multi" | "head_to_head";

type CompetitiveRiskOutput = {
  monthly_risk: number;
  /** Kept for consumers expecting two-state signal; maps from confidence_level */
  confidence: "low" | "medium";
  confidence_level?: "high" | "medium" | "low";
  /** Short reason string; pair with confidence_level in UI */
  confidence_explanation?: string;
};

export type ActionableFactorLabel = "First impression speed" | "Interaction delay" | "Layout stability";

export type DominantDriverOutput = {
  label: ActionableFactorLabel;
  severity: "large" | "medium" | "small";
};

export type CompetitorActionPlanItem = {
  action: string;
  impact_explanation: string;
  estimated_recovery: number;
  priority_rank: number;
};

export type RecommendedCompetitorAction = "ACT_NOW" | "PRIORITIZE" | "MONITOR" | "IMPROVE";

/** Overall position vs competitors (same signal as comparison summary). */
export type RelativeVsCompetitor = "Behind" | "Ahead" | "Similar";

/** Absolute site health on 0–10 scale (from dashboard overall health / 10). */
export type AbsoluteHealthState = "POOR" | "MODERATE" | "GOOD";

/** Business labels only — no raw metrics exposed to UI. */
export type CompetitorComparisonRow = {
  site: string;
  speed: "Fast" | "Moderate" | "Slow";
  experience: "Smooth" | "Stable" | "Poor";
  position: "Leading" | "Behind";
};

/** Table position vs competitors (never Faster/Slower/etc. in the UI). */
export type SnapshotPosition = "Behind" | "Ahead" | "Similar";

/** Snapshot table: relative labels only (no numbers, no metric names). */
export type ComparisonSnapshotRow = {
  factor: string;
  /** Internal labels for what-this-means fallback / legacy readers. */
  your_site: string;
  competitor: string;
  /** Competitive difference magnitude (ordering + dominant driver). */
  impact: "High" | "Medium" | "Low";
  /** Business salience for Impact column: first screen & drop-off high, interaction medium. */
  business_impact?: "High" | "Medium" | "Low";
  position?: SnapshotPosition;
  /** One short business-consequence line (no technical jargon). */
  why_it_matters?: string;
};

function positionFromImpressionYour(your: string): SnapshotPosition {
  if (your === "Faster") return "Ahead";
  if (your === "Slower") return "Behind";
  return "Similar";
}

function positionFromInteractionYour(your: string): SnapshotPosition {
  if (your === "Smooth") return "Ahead";
  if (your === "Delayed") return "Behind";
  return "Similar";
}

function positionFromDropoffYour(your: string): SnapshotPosition {
  if (your === "Lower") return "Ahead";
  if (your === "Higher") return "Behind";
  return "Similar";
}

function businessImpactForFactor(factor: string): "High" | "Medium" | "Low" {
  if (factor === "Interaction readiness") return "Medium";
  return "High";
}

export type MultiCompetitorAnalysisOutput = {
  mode: "multi";
  competitor_summary: {
    position: string;
    faster_competitors: number;
    slower_competitors: number;
  };
  performance_gap_score: number;
  competitive_risk: CompetitiveRiskOutput;
  comparison_rows: CompetitorComparisonRow[];
  comparison_snapshot: ComparisonSnapshotRow[];
  dominant_driver: DominantDriverOutput;
  action_plan: CompetitorActionPlanItem[];
  recommended_action: RecommendedCompetitorAction;
  insight: string;
  action_hint: string;
};

export type HeadToHeadAnalysisOutput = {
  mode: "head_to_head";
  comparison: {
    status: "slower" | "faster" | "similar";
    gap_score: number;
  };
  competitive_risk: CompetitiveRiskOutput;
  comparison_rows: CompetitorComparisonRow[];
  comparison_snapshot: ComparisonSnapshotRow[];
  dominant_driver: DominantDriverOutput;
  action_plan: CompetitorActionPlanItem[];
  recommended_action: RecommendedCompetitorAction;
  insight: string;
  action_hint: string;
};

export type CompetitorAnalysisOutput = MultiCompetitorAnalysisOutput | HeadToHeadAnalysisOutput;

type LighthouseExtracted = {
  lcpMs?: number;
  cls?: number;
  inpMs?: number;
  /** Server response (TTFB), ms — from `server-response-time` audit. */
  ttfbMs?: number;
  performanceScore?: number;
};

type NormalizedSitePerformance = {
  performanceIndex: number; // 0..1 (higher is better)
  componentsPresent: number; // how many of (lcp, inp, cls, performanceScore) were available
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function roundTo(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

function roundToCents(n: number): number {
  // Business outputs should not imply more precision than cents.
  return roundTo(n, 2);
}

function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function normalizePerformanceScore(raw: number | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  // Lighthouse performance category score is usually 0..1, but guard for 0..100.
  if (raw <= 1.05) return clamp01(raw);
  if (raw <= 100.1) return clamp01(raw / 100);
  return null;
}

function normalizeLcpToPerf(lcpMs: number | undefined): number | null {
  if (lcpMs == null || !Number.isFinite(lcpMs) || lcpMs <= 0) return null;
  const low = 2500;
  const high = 5000;
  if (lcpMs <= low) return 1;
  if (lcpMs >= high) return 0;
  return (high - lcpMs) / (high - low);
}

function normalizeInpToPerf(inpMs: number | undefined): number | null {
  if (inpMs == null || !Number.isFinite(inpMs) || inpMs <= 0) return null;
  const low = 200;
  const high = 500;
  if (inpMs <= low) return 1;
  if (inpMs >= high) return 0;
  return (high - inpMs) / (high - low);
}

function normalizeClsToPerf(cls: number | undefined): number | null {
  if (cls == null || !Number.isFinite(cls) || cls <= 0) return null;
  const low = 0.1;
  const high = 0.25;
  if (cls <= low) return 1;
  if (cls >= high) return 0;
  return (high - cls) / (high - low);
}

/** Higher = faster server response (better). */
function normalizeTtfbToPerf(ttfbMs: number | undefined): number | null {
  if (ttfbMs == null || !Number.isFinite(ttfbMs) || ttfbMs < 0) return null;
  const low = 200;
  const high = 1000;
  if (ttfbMs <= low) return 1;
  if (ttfbMs >= high) return 0;
  return (high - ttfbMs) / (high - low);
}

function computePerformanceIndex(ex: LighthouseExtracted): NormalizedSitePerformance {
  const lcpPerf = normalizeLcpToPerf(ex.lcpMs);
  const inpPerf = normalizeInpToPerf(ex.inpMs);
  const clsPerf = normalizeClsToPerf(ex.cls);
  const scorePerf = normalizePerformanceScore(ex.performanceScore);

  const weights = {
    lcp: 0.4,
    inp: 0.3,
    cls: 0.2,
    perfScore: 0.1,
  } as const;

  const present: Array<{ key: keyof typeof weights; perf: number | null }> = [
    { key: "lcp", perf: lcpPerf },
    { key: "inp", perf: inpPerf },
    { key: "cls", perf: clsPerf },
    { key: "perfScore", perf: scorePerf },
  ];

  const available = present.filter((p) => p.perf != null) as Array<{ key: keyof typeof weights; perf: number }>;
  if (available.length === 0) {
    return { performanceIndex: 0, componentsPresent: 0 };
  }

  const availableWeight = available.reduce((s, p) => s + weights[p.key], 0);
  const weightedSum = available.reduce((s, p) => s + p.perf * weights[p.key], 0);
  const performanceIndex = availableWeight > 0 ? weightedSum / availableWeight : 0;

  return {
    performanceIndex: clamp01(performanceIndex),
    componentsPresent: available.length,
  };
}

function formatPosition(userRank: number, totalSites: number): string {
  return `${userRank} of ${totalSites}`;
}

function safeAveragePositive(diffs: number[]): number {
  const positives = diffs.filter((d) => d > 0 && Number.isFinite(d));
  if (positives.length === 0) return 0;
  return positives.reduce((s, d) => s + d, 0) / positives.length;
}

function computeCappedMonthlyRisk(args: {
  baselineRevenue: number;
  gapScore: number; // 0..1-ish
  sensitivityFactor: number; // e.g. 0.1
}): number {
  const baseline = Number.isFinite(args.baselineRevenue) ? Math.max(0, args.baselineRevenue) : 0;
  if (baseline <= 0) return 0;

  const raw = baseline * Math.max(0, args.gapScore) * args.sensitivityFactor;
  const cap = baseline * 0.3; // <= 30% of baselineRevenue
  const capped = Math.min(raw, cap);
  return roundToCents(capped);
}

function siteDisplayName(url: string, isUser: boolean): string {
  if (isUser) return "Your site";
  try {
    const h = new URL(url).hostname.replace(/^www\./i, "");
    return h || "Competitor";
  } catch {
    return "Competitor";
  }
}

/** From composite performance index (0–1), higher = better. */
function speedLabelFromIndex(i: number): "Fast" | "Moderate" | "Slow" {
  if (i > 0.75) return "Fast";
  if (i >= 0.5) return "Moderate";
  return "Slow";
}

/** Distinct from speed labels — reflects overall “feel” band without naming metrics. */
function experienceLabelFromIndex(i: number): "Smooth" | "Stable" | "Poor" {
  if (i > 0.72) return "Smooth";
  if (i >= 0.45) return "Stable";
  return "Poor";
}

function positionLabelsForIndices(indices: number[]): ("Leading" | "Behind")[] {
  if (indices.length === 0) return [];
  const max = Math.max(...indices);
  const eps = 1e-6;
  return indices.map((idx) => (idx >= max - eps ? "Leading" : "Behind"));
}

const SNAPSHOT_EPS = 0.02;

/** Internal 0–1 sub-scores from the same normalized signals as performance_index (no raw values exposed). */
function computeSubIndices(ex: LighthouseExtracted, fallbackIndex: number): {
  impression: number;
  interaction: number;
  stability: number;
} {
  const lcp = normalizeLcpToPerf(ex.lcpMs);
  const inp = normalizeInpToPerf(ex.inpMs);
  const cls = normalizeClsToPerf(ex.cls);
  const perf = normalizePerformanceScore(ex.performanceScore);
  const impression = clamp01(lcp ?? perf ?? fallbackIndex);
  const interaction = clamp01(
    inp ?? (lcp != null && cls != null ? (lcp + cls) / 2 : perf ?? fallbackIndex)
  );
  const stability = clamp01(cls ?? perf ?? fallbackIndex);
  return { impression, interaction, stability };
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function snapshotImpactLevel(absDiff: number): "High" | "Medium" | "Low" {
  if (absDiff > 0.12) return "High";
  if (absDiff > 0.04) return "Medium";
  return "Low";
}

function labelImpressionPair(userI: number, compAvg: number): { your: string; comp: string } {
  const d = userI - compAvg;
  if (d > SNAPSHOT_EPS) return { your: "Faster", comp: "Slower" };
  if (d < -SNAPSHOT_EPS) return { your: "Slower", comp: "Faster" };
  return { your: "Comparable", comp: "Comparable" };
}

function labelInteractionPair(userI: number, compAvg: number): { your: string; comp: string } {
  const d = userI - compAvg;
  if (d > SNAPSHOT_EPS) return { your: "Smooth", comp: "Delayed" };
  if (d < -SNAPSHOT_EPS) return { your: "Delayed", comp: "Smooth" };
  return { your: "Comparable", comp: "Comparable" };
}

/** Drop-off risk rises when stability is lower; compare risk = 1 - stability. */
function labelDropoffPair(userStability: number, compAvgStability: number): { your: string; comp: string } {
  const riskU = 1 - userStability;
  const riskC = 1 - compAvgStability;
  const d = riskU - riskC;
  if (d > SNAPSHOT_EPS) return { your: "Higher", comp: "Lower" };
  if (d < -SNAPSHOT_EPS) return { your: "Lower", comp: "Higher" };
  return { your: "Comparable", comp: "Comparable" };
}

export function buildComparisonSnapshot(args: {
  userExtracted: LighthouseExtracted;
  competitorExtracteds: LighthouseExtracted[];
  userPerformanceIndex: number;
  competitorPerformanceIndices: number[];
  /** Normalized site URL for deterministic phrase selection */
  siteKey: string;
}): ComparisonSnapshotRow[] {
  const { userExtracted, competitorExtracteds, userPerformanceIndex, competitorPerformanceIndices, siteKey } = args;
  const phraseSeed = siteKey.trim() || "unknown";
  const u = computeSubIndices(userExtracted, userPerformanceIndex);
  const compSubs = competitorExtracteds.map((ex, i) =>
    computeSubIndices(ex, competitorPerformanceIndices[i] ?? userPerformanceIndex)
  );
  const im = average(compSubs.map((c) => c.impression));
  const inter = average(compSubs.map((c) => c.interaction));
  const stab = average(compSubs.map((c) => c.stability));

  const p1 = labelImpressionPair(u.impression, im);
  const p2 = labelInteractionPair(u.interaction, inter);
  const p3 = labelDropoffPair(u.stability, stab);

  const diff1 = Math.abs(u.impression - im);
  const diff2 = Math.abs(u.interaction - inter);
  const diff3 = Math.abs(1 - u.stability - (1 - stab));

  const uTtfb = normalizeTtfbToPerf(userExtracted.ttfbMs);
  const compTtfbPerfs = competitorExtracteds
    .map((ex) => normalizeTtfbToPerf(ex.ttfbMs))
    .filter((x): x is number => x != null);
  const ttfbCompAvg =
    compTtfbPerfs.length > 0 ? compTtfbPerfs.reduce((a, b) => a + b, 0) / compTtfbPerfs.length : null;
  const p4 =
    uTtfb != null && ttfbCompAvg != null
      ? labelImpressionPair(uTtfb, ttfbCompAvg)
      : { your: "Comparable", comp: "Comparable" };
  const diff4 =
    uTtfb != null && ttfbCompAvg != null ? Math.abs(uTtfb - ttfbCompAvg) : 0;
  const impact4 = snapshotImpactLevel(diff4);
  const pos4 = positionFromImpressionYour(p4.your);
  const r1: ComparisonSnapshotRow = {
    factor: "First impression speed",
    your_site: p1.your,
    competitor: p1.comp,
    impact: snapshotImpactLevel(diff1),
    business_impact: "High",
    position: positionFromImpressionYour(p1.your),
  };
  r1.why_it_matters = pickWhyItMattersPhrase(phraseSeed, r1.factor, r1);

  const r2: ComparisonSnapshotRow = {
    factor: "Interaction readiness",
    your_site: p2.your,
    competitor: p2.comp,
    impact: snapshotImpactLevel(diff2),
    business_impact: "Medium",
    position: positionFromInteractionYour(p2.your),
  };
  r2.why_it_matters = pickWhyItMattersPhrase(phraseSeed, r2.factor, r2);

  const r3: ComparisonSnapshotRow = {
    factor: "User drop-off risk",
    your_site: p3.your,
    competitor: p3.comp,
    impact: snapshotImpactLevel(diff3),
    business_impact: "High",
    position: positionFromDropoffYour(p3.your),
  };
  r3.why_it_matters = pickWhyItMattersPhrase(phraseSeed, r3.factor, r3);

  const r4: ComparisonSnapshotRow = {
    factor: "Backend response",
    your_site: p4.your,
    competitor: p4.comp,
    impact: impact4,
    business_impact: impact4,
    position: pos4,
  };
  r4.why_it_matters = pickWhyItMattersPhrase(phraseSeed, r4.factor, r4);

  const base: ComparisonSnapshotRow[] = [r1, r2, r3, r4];

  return base.slice(0, 4);
}

function impactToGapSeverity(impact: ComparisonSnapshotRow["impact"]): DominantDriverOutput["severity"] {
  if (impact === "High") return "large";
  if (impact === "Medium") return "medium";
  return "small";
}

function gapSeverityWeight(severity: DominantDriverOutput["severity"]): number {
  if (severity === "large") return 1.0;
  if (severity === "medium") return 0.6;
  return 0.3;
}

function businessImpactWeightForFactor(factor: string): number {
  if (factor === "First impression speed") return 1.0;
  if (factor === "Interaction readiness") return 0.8;
  if (factor === "User drop-off risk") return 0.9;
  if (factor === "Backend response") return 0.85;
  return 0.85;
}

function rowByFactor(rows: ComparisonSnapshotRow[], factor: string): ComparisonSnapshotRow | undefined {
  return rows.find((r) => r.factor === factor);
}

function interactionGapExists(rows: ComparisonSnapshotRow[]): boolean {
  const r = rowByFactor(rows, "Interaction readiness");
  return r != null && r.impact !== "Low";
}

function speedGapExists(rows: ComparisonSnapshotRow[]): boolean {
  const r = rowByFactor(rows, "First impression speed");
  return r != null && r.impact !== "Low";
}

function dropoffHigh(rows: ComparisonSnapshotRow[]): boolean {
  const r = rowByFactor(rows, "User drop-off risk");
  return r?.impact === "High";
}

/** Map snapshot row to actionable cause label (resolves “User drop-off risk” into speed, interaction delay, or layout). */
export function actionableLabelForSnapshotRow(row: ComparisonSnapshotRow, rows: ComparisonSnapshotRow[]): ActionableFactorLabel {
  if (row.factor === "First impression speed") return "First impression speed";
  if (row.factor === "Interaction readiness") return "Interaction delay";
  if (row.factor === "Backend response") return "First impression speed";
  if (row.factor === "User drop-off risk") {
    const ig = interactionGapExists(rows);
    const sg = speedGapExists(rows);
    if (dropoffHigh(rows) && ig) return "Interaction delay";
    if (dropoffHigh(rows) && sg) return "First impression speed";
    if (dropoffHigh(rows)) return "Layout stability";
    if (ig) return "Interaction delay";
    if (sg) return "First impression speed";
    return "Layout stability";
  }
  return "First impression speed";
}

function resolveDominantActionableLabel(
  rows: ComparisonSnapshotRow[],
  best: { row: ComparisonSnapshotRow; severity: DominantDriverOutput["severity"] }
): DominantDriverOutput {
  const label = actionableLabelForSnapshotRow(best.row, rows);
  return { label, severity: best.severity };
}

/** Whether the user is winning on this snapshot row (null = comparable). */
export function userIsWinningOnSnapshotRow(row: ComparisonSnapshotRow): boolean | null {
  if (row.position === "Ahead") return true;
  if (row.position === "Behind") return false;
  if (row.position === "Similar") return null;
  if (row.factor === "First impression speed") {
    if (row.your_site === "Faster") return true;
    if (row.your_site === "Slower") return false;
    return null;
  }
  if (row.factor === "Interaction readiness") {
    if (row.your_site === "Smooth") return true;
    if (row.your_site === "Delayed") return false;
    return null;
  }
  if (row.factor === "User drop-off risk") {
    if (row.your_site === "Lower") return true;
    if (row.your_site === "Higher") return false;
    return null;
  }
  return null;
}

export function getSnapshotPosition(row: ComparisonSnapshotRow): SnapshotPosition {
  if (row.position) return row.position;
  const w = userIsWinningOnSnapshotRow(row);
  if (w === true) return "Ahead";
  if (w === false) return "Behind";
  return "Similar";
}

export function rowBusinessImpact(row: ComparisonSnapshotRow): "High" | "Medium" | "Low" {
  if (row.business_impact) return row.business_impact;
  return businessImpactForFactor(row.factor);
}

/** Map stored 0–100 overall health to 0–10 website health score. */
export function healthScore10FromOverall100(score100: number): number {
  if (!Number.isFinite(score100) || score100 < 0) return 5;
  return Math.min(10, Math.max(0, score100 / 10));
}

export function absoluteStateFromHealth10(h: number): AbsoluteHealthState {
  const x = Number.isFinite(h) ? Math.min(10, Math.max(0, h)) : 5;
  if (x < 5) return "POOR";
  if (x <= 7) return "MODERATE";
  return "GOOD";
}

export function relativeVsCompetitor(result: CompetitorAnalysisOutput): RelativeVsCompetitor {
  if (result.mode === "head_to_head") {
    const s = result.comparison?.status;
    if (s === "slower") return "Behind";
    if (s === "faster") return "Ahead";
    return "Similar";
  }
  const cs = result.competitor_summary;
  if (!cs) return "Similar";
  if (cs.faster_competitors > 0) return "Behind";
  if (cs.slower_competitors > 0 && cs.faster_competitors === 0) return "Ahead";
  return "Similar";
}

/**
 * Dual-layer decision: relative position vs competitors + absolute site health (0–10).
 */
export function dualLayerRecommendedAction(
  relative: RelativeVsCompetitor,
  absolute: AbsoluteHealthState
): RecommendedCompetitorAction {
  if (relative === "Behind") return "ACT_NOW";
  if (relative === "Similar" && absolute === "POOR") return "ACT_NOW";
  if (relative === "Ahead" && absolute === "POOR") return "IMPROVE";
  if (relative === "Ahead" && absolute === "GOOD") return "MONITOR";
  if (relative === "Similar" && absolute === "GOOD") return "MONITOR";
  if (relative === "Similar" && absolute === "MODERATE") return "PRIORITIZE";
  if (relative === "Ahead" && absolute === "MODERATE") return "PRIORITIZE";
  return "MONITOR";
}

/** Behind + High business impact first … Ahead last. */
export function sortComparisonSnapshotRows(rows: ComparisonSnapshotRow[]): ComparisonSnapshotRow[] {
  const posRank = (p: SnapshotPosition) => (p === "Behind" ? 0 : p === "Similar" ? 1 : 2);
  const bizRank = (b: "High" | "Medium" | "Low") => (b === "High" ? 0 : b === "Medium" ? 1 : 2);
  return [...rows].sort((a, b) => {
    const pa = posRank(getSnapshotPosition(a));
    const pb = posRank(getSnapshotPosition(b));
    if (pa !== pb) return pa - pb;
    return bizRank(rowBusinessImpact(a)) - bizRank(rowBusinessImpact(b));
  });
}

/** Strongest business impact among rows where position is Behind. */
export function getPrimaryCompetitorIssue(
  rows: ComparisonSnapshotRow[]
): { factor: string; businessImpact: "High" | "Medium" | "Low" } | null {
  const behind = rows.filter((r) => getSnapshotPosition(r) === "Behind");
  if (behind.length === 0) return null;
  const rank = (b: "High" | "Medium" | "Low") => (b === "High" ? 0 : b === "Medium" ? 1 : 2);
  let best = behind[0]!;
  for (const r of behind) {
    if (rank(rowBusinessImpact(r)) < rank(rowBusinessImpact(best))) best = r;
  }
  return { factor: best.factor, businessImpact: rowBusinessImpact(best) };
}

export type SnapshotNarrativeCopy = {
  headline: string | null;
  summaryLine: string | null;
};

/**
 * Narrative copy derived from table reality so headline and table cannot conflict.
 */
export function snapshotNarrativeCopy(rows: ComparisonSnapshotRow[], siteKey: string): SnapshotNarrativeCopy {
  if (rows.length === 0) return { headline: null, summaryLine: null };

  const phraseSeed = siteKey.trim() || "unknown";
  const positions = rows.map((row) => getSnapshotPosition(row));
  const hasBehind = positions.includes("Behind");
  const hasAhead = positions.includes("Ahead");
  const allSimilar = positions.every((p) => p === "Similar");
  const hasHighDifference = rows.some((row) => row.impact === "High");
  const hasDominantFactor = rows.some(
    (row) => getSnapshotPosition(row) !== "Similar" && row.impact === "High"
  );

  let headline: string | null = null;
  if (allSimilar) {
    headline = "Performance is similar to competitors";
  } else if (!hasBehind && hasAhead && !hasDominantFactor) {
    headline = "You are slightly ahead overall, but no single factor stands out";
  } else if (!hasBehind) {
    headline = "No clear advantage or gap compared to competitors";
  }

  let summaryLine: string | null = null;
  if (!hasBehind) {
    const tableIntent = hasHighDifference ? "neutral_no_weakness" : "neutral_minor_gap";
    summaryLine = pickSnapshotSummaryLine(phraseSeed, tableIntent);
  }

  return { headline, summaryLine };
}

/** Difference column: green when user leads on the row, red when behind (never red for an advantage). */
export function differenceColumnForRow(row: ComparisonSnapshotRow): { emoji: string; label: string } {
  const impact = row.impact ?? "Low";
  const sizeLabel = impact === "High" ? "Large" : impact === "Medium" ? "Medium" : "Small";
  const w = userIsWinningOnSnapshotRow(row);
  if (w === true) return { emoji: "🟢", label: sizeLabel };
  if (w === false) return { emoji: "🔴", label: sizeLabel };
  return { emoji: "⚪", label: sizeLabel };
}

type ActionLever = "first" | "inp" | "guard";

function shareByDominant(dominant: ActionableFactorLabel): Record<ActionLever, number> {
  if (dominant === "First impression speed") return { first: 0.45, inp: 0.35, guard: 0.2 };
  if (dominant === "Interaction delay") return { first: 0.3, inp: 0.5, guard: 0.2 };
  return { first: 0.25, inp: 0.25, guard: 0.5 };
}

function buildThreeLeverActionPlan(args: {
  monthly_risk: number;
  dominant: DominantDriverOutput;
}): CompetitorActionPlanItem[] {
  const risk = Number.isFinite(args.monthly_risk) ? Math.max(0, args.monthly_risk) : 0;
  const shares = shareByDominant(args.dominant.label);

  const defs: Array<{
    lever: ActionLever;
    action: string;
    impact_explanation: string;
  }> = [
    {
      lever: "first",
      action: "Maintain fast first screen",
      impact_explanation:
        "heavy hero payload → slow paint → visitors leave before the value proposition",
    },
    {
      lever: "inp",
      action: "Reduce interaction delays",
      impact_explanation:
        "blocking work on the main thread → taps queue → users abandon mid-task",
    },
    {
      lever: "guard",
      action: "Prevent regressions (monitor scripts and releases)",
      impact_explanation:
        "new scripts per release → speed slips → competitors close the gap",
    },
  ];

  const ordered = [...defs].sort((a, b) => shares[b.lever] - shares[a.lever]);

  return ordered.map((d, i) => ({
    action: d.action,
    impact_explanation: d.impact_explanation,
    estimated_recovery: roundToCents(risk * shares[d.lever]),
    priority_rank: i + 1,
  }));
}

function legacyConfidenceFromLevel(level: "high" | "medium" | "low"): "low" | "medium" {
  return level === "low" ? "low" : "medium";
}

function buildConfidenceExplanation(
  rows: ComparisonSnapshotRow[],
  confidence_level: "high" | "medium" | "low"
): string {
  const impression = rowByFactor(rows, "First impression speed");
  const interaction = rowByFactor(rows, "Interaction readiness");
  const imp = impression?.impact;
  const int = interaction?.impact;
  const impStrong = imp === "High" || imp === "Medium";
  const intStrong = int === "High" || int === "Medium";
  const impWeak = imp === "Low";
  const intWeak = int === "Low";

  if (confidence_level === "high") {
    return "signals line up across factors, so the ranking holds.";
  }
  if (confidence_level === "medium") {
    if (impStrong && intWeak) {
      return "first-screen separation dominates; dollar split is directional.";
    }
    if (intStrong && impWeak) {
      return "interaction drives the pain; first-screen looks tied.";
    }
    return "mixed factor strength; treat dollars as directional.";
  }
  return "signals thin or split; rerun after changes.";
}

function computeDecisionLayer(args: {
  comparison_snapshot: ComparisonSnapshotRow[];
  monthly_risk: number;
  healthScore0to10: number;
  relative: RelativeVsCompetitor;
}): {
  dominant_driver: DominantDriverOutput;
  action_plan: CompetitorActionPlanItem[];
  confidence_level: "high" | "medium" | "low";
  confidence_explanation: string;
  recommended_action: RecommendedCompetitorAction;
} {
  const rows = args.comparison_snapshot ?? [];
  const scored = rows.map((row) => {
    const severity = impactToGapSeverity(row.impact);
    const w = gapSeverityWeight(severity) * businessImpactWeightForFactor(row.factor);
    return { row, severity, weightedImpactScore: w };
  });

  let dominant: DominantDriverOutput = {
    label: "First impression speed",
    severity: "small",
  };
  if (scored.length > 0) {
    let best = scored[0]!;
    for (const s of scored) {
      if (s.weightedImpactScore > best.weightedImpactScore) best = s;
    }
    dominant = resolveDominantActionableLabel(rows, best);
  }

  const action_plan = buildThreeLeverActionPlan({
    monthly_risk: Number.isFinite(args.monthly_risk) ? Math.max(0, args.monthly_risk) : 0,
    dominant,
  });

  const nonSmallFactors = rows.filter((r) => r.impact !== "Low").length;
  const impacts = rows.map((r) => r.impact);
  const allSameImpact =
    impacts.length >= 3 && impacts[0] != null && impacts.every((x) => x === impacts[0]);
  const consistencyBetweenFactors = allSameImpact ? 1 : 0;
  const signalCount = nonSmallFactors + consistencyBetweenFactors;
  const confidenceScore =
    rows.length > 0 ? clamp01(signalCount / rows.length) : 0;
  let confidence_level: "high" | "medium" | "low";
  if (confidenceScore > 0.7) confidence_level = "high";
  else if (confidenceScore > 0.4) confidence_level = "medium";
  else confidence_level = "low";

  const recommended_action = dualLayerRecommendedAction(
    args.relative,
    absoluteStateFromHealth10(args.healthScore0to10)
  );

  const confidence_explanation = buildConfidenceExplanation(rows, confidence_level);

  return {
    dominant_driver: dominant,
    action_plan,
    confidence_level,
    confidence_explanation,
    recommended_action,
  };
}

function buildComparisonRows(args: {
  userUrl: string;
  competitorUrls: string[];
  userIndex: number;
  competitorIndices: number[];
}): CompetitorComparisonRow[] {
  const { userUrl, competitorUrls, userIndex, competitorIndices } = args;
  const allIndices = [userIndex, ...competitorIndices];
  const positions = positionLabelsForIndices(allIndices);
  const rows: CompetitorComparisonRow[] = [
    {
      site: siteDisplayName(userUrl, true),
      speed: speedLabelFromIndex(userIndex),
      experience: experienceLabelFromIndex(userIndex),
      position: positions[0] ?? "Behind",
    },
  ];
  for (let i = 0; i < competitorIndices.length; i++) {
    const idx = competitorIndices[i];
    const url = competitorUrls[i] ?? "";
    rows.push({
      site: siteDisplayName(url, false),
      speed: speedLabelFromIndex(idx),
      experience: experienceLabelFromIndex(idx),
      position: positions[i + 1] ?? "Behind",
    });
  }
  return rows;
}

async function fetchLighthouseData(url: string, timeoutMs: number): Promise<LighthouseExtracted> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Do not import @/lib/pageSpeedEnv here — this module is also imported by client UI; pageSpeedEnv pulls @next/env (Node `fs`).
    const key =
      process.env.PAGESPEED_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
    if (!key) return {};
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${key}`,
      { signal: controller.signal }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const lighthouse = data?.lighthouseResult;
    const audits = lighthouse?.audits as Record<string, any> | undefined;
    if (!audits) return {};

    const lcpMs = audits["largest-contentful-paint"]?.numericValue;
    const cls = audits["cumulative-layout-shift"]?.numericValue;
    const inpMs = audits["interaction-to-next-paint"]?.numericValue;
    const ttfbMs = audits["server-response-time"]?.numericValue;

    const performanceScoreRaw = lighthouse?.categories?.performance?.score;

    const extracted: LighthouseExtracted = {};
    if (typeof lcpMs === "number" && Number.isFinite(lcpMs)) extracted.lcpMs = lcpMs;
    if (typeof cls === "number" && Number.isFinite(cls)) extracted.cls = cls;
    if (typeof inpMs === "number" && Number.isFinite(inpMs)) extracted.inpMs = inpMs;
    if (typeof ttfbMs === "number" && Number.isFinite(ttfbMs)) extracted.ttfbMs = ttfbMs;
    if (typeof performanceScoreRaw === "number" && Number.isFinite(performanceScoreRaw)) extracted.performanceScore = performanceScoreRaw;

    return extracted;
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function computeCompetitorAnalysis(args: {
  userUrl: string;
  competitorUrls: string[];
  baselineRevenue: number;
  /** Optional 0–10 website health (dashboard overall health / 10). If omitted, defaults to 5 (moderate). */
  healthScore0to10?: number;
}): Promise<CompetitorAnalysisOutput | null> {
  const userUrl = normalizeUrl(args.userUrl);
  const competitorUrls = (args.competitorUrls || []).map(normalizeUrl).filter(Boolean).slice(0, 3);
  if (!userUrl) return null;
  if (competitorUrls.length === 0) return null;

  const health10 =
    args.healthScore0to10 != null && Number.isFinite(args.healthScore0to10)
      ? Math.min(10, Math.max(0, args.healthScore0to10))
      : 5;

  // Spec: mode handling
  const mode: CompetitorAnalysisMode = competitorUrls.length === 1 ? "head_to_head" : "multi";
  const sensitivityFactor = 0.1;

  // Lightweight + deterministic: fetch, normalize, compute simple deltas.
  const timeoutMs = 30000;

  const [userExtracted, competitorSettled] = await Promise.allSettled([
    fetchLighthouseData(userUrl, timeoutMs),
    Promise.allSettled(competitorUrls.map((u) => fetchLighthouseData(u, timeoutMs))),
  ]);

  const userResult: LighthouseExtracted | null =
    userExtracted.status === "fulfilled" ? userExtracted.value : null;

  const userPerf = computePerformanceIndex(userResult ?? {});

  type CompetitorFetchOk = { url: string; extracted: LighthouseExtracted };
  const competitorsOk: CompetitorFetchOk[] = [];
  if (competitorSettled.status === "fulfilled") {
    competitorUrls.forEach((u, idx) => {
      const c = competitorSettled.value[idx];
      if (c?.status === "fulfilled") {
        competitorsOk.push({ url: u, extracted: c.value });
      }
    });
  }

  // If we couldn't extract any competitor signal, treat as "no competitors".
  if (competitorsOk.length === 0) return null;

  const competitorPerfs = competitorsOk.map((row) => computePerformanceIndex(row.extracted));
  const competitorUrlsResolved = competitorsOk.map((row) => row.url);

  if (mode === "head_to_head") {
    const competitorIndex = competitorPerfs[0]?.performanceIndex ?? 0;
    const gapScoreRaw = competitorIndex - userPerf.performanceIndex;
    const gapScore = roundTo(gapScoreRaw, 2);

    let status: "slower" | "faster" | "similar";
    if (gapScoreRaw > 0) status = "slower";
    else if (gapScoreRaw < 0) status = "faster";
    else status = "similar";
    // Similar threshold (spec)
    if (Math.abs(gapScoreRaw) < 0.05) status = "similar";

    const competitiveRiskMonthly =
      gapScoreRaw <= 0
        ? 0
        : computeCappedMonthlyRisk({
            baselineRevenue: args.baselineRevenue,
            gapScore: gapScoreRaw,
            sensitivityFactor,
          });

    const comparison_snapshot = buildComparisonSnapshot({
      userExtracted: userResult ?? {},
      competitorExtracteds: [competitorsOk[0].extracted],
      userPerformanceIndex: userPerf.performanceIndex,
      competitorPerformanceIndices: [competitorPerfs[0].performanceIndex],
      siteKey: normalizeUrl(userUrl),
    });

    const relative: RelativeVsCompetitor =
      status === "slower" ? "Behind" : status === "faster" ? "Ahead" : "Similar";

    const decision = computeDecisionLayer({
      comparison_snapshot,
      monthly_risk: competitiveRiskMonthly,
      healthScore0to10: health10,
      relative,
    });

    const insight =
      status === "slower"
        ? "They load faster → attention shifts first → you lose conversions before your pitch completes."
        : status === "faster"
          ? "You lead on speed → heavy bundles or third parties can erase that lead on the next release."
          : "Speed is tied → offer clarity and trust decide who converts.";

    const action_hint =
      status === "slower"
        ? "Address the dominant shortfall, then rerun to confirm it shrinks."
        : status === "faster"
          ? "Require mobile smoke tests before release — prevent regressions that hand sessions back."
          : "Fund message and funnel path, not extra speed work.";

    const comparison_rows = buildComparisonRows({
      userUrl,
      competitorUrls: competitorUrlsResolved,
      userIndex: userPerf.performanceIndex,
      competitorIndices: [competitorIndex],
    });

    return {
      mode,
      comparison: { status, gap_score: gapScore },
      competitive_risk: {
        monthly_risk: competitiveRiskMonthly,
        confidence: legacyConfidenceFromLevel(decision.confidence_level),
        confidence_level: decision.confidence_level,
        confidence_explanation: decision.confidence_explanation,
      },
      comparison_rows,
      comparison_snapshot,
      dominant_driver: decision.dominant_driver,
      action_plan: decision.action_plan,
      recommended_action: decision.recommended_action,
      insight,
      action_hint,
    };
  }

  // Multi mode
  const userIndex = userPerf.performanceIndex;
  const competitorIndices = competitorPerfs.map((p) => p.performanceIndex);

  const orderedSites = [
    { kind: "user" as const, index: userIndex },
    ...competitorIndices.map((idx) => ({ kind: "competitor" as const, index: idx })),
  ].sort((a, b) => b.index - a.index);

  const userRank = orderedSites.findIndex((s) => s.kind === "user") + 1;
  const totalSites = orderedSites.length;

  const fasterCompetitors = competitorIndices.filter((idx) => idx > userIndex).length;
  const slowerCompetitors = competitorIndices.filter((idx) => idx < userIndex).length;

  const positiveDiffs = competitorIndices.map((idx) => idx - userIndex);
  const performanceGapScoreRaw = safeAveragePositive(positiveDiffs);
  const performanceGapScore = roundTo(performanceGapScoreRaw, 2);

  const competitiveRiskMonthly = computeCappedMonthlyRisk({
    baselineRevenue: args.baselineRevenue,
    gapScore: performanceGapScoreRaw,
    sensitivityFactor,
  });

  const comparison_rows = buildComparisonRows({
    userUrl,
    competitorUrls: competitorUrlsResolved,
    userIndex,
    competitorIndices,
  });

  const comparison_snapshot = buildComparisonSnapshot({
    userExtracted: userResult ?? {},
    competitorExtracteds: competitorsOk.map((r) => r.extracted),
    userPerformanceIndex: userPerf.performanceIndex,
    competitorPerformanceIndices: competitorPerfs.map((p) => p.performanceIndex),
    siteKey: normalizeUrl(userUrl),
  });

  const relative: RelativeVsCompetitor =
    fasterCompetitors > 0 ? "Behind" : slowerCompetitors > 0 && fasterCompetitors === 0 ? "Ahead" : "Similar";

  const decision = computeDecisionLayer({
    comparison_snapshot,
    monthly_risk: competitiveRiskMonthly,
    healthScore0to10: health10,
    relative,
  });

  const insight =
    fasterCompetitors > 0
      ? `You trail ${fasterCompetitors} of ${competitorIndices.length} sites on speed → comparers exit your funnel earlier.`
      : "You match or lead on speed → copy and funnel path move revenue before more speed tuning.";

  const action_hint =
    fasterCompetitors > 0
      ? "Execute ranked actions in order; rerun to confirm the shortfall closes."
      : "Keep releases tight; fund offer and onboarding where conversion actually moves.";

  return {
    mode,
    competitor_summary: {
      position: formatPosition(userRank > 0 ? userRank : 1, totalSites || 1),
      faster_competitors: fasterCompetitors,
      slower_competitors: slowerCompetitors,
    },
    performance_gap_score: performanceGapScore,
    competitive_risk: {
      monthly_risk: competitiveRiskMonthly,
      confidence: legacyConfidenceFromLevel(decision.confidence_level),
      confidence_level: decision.confidence_level,
      confidence_explanation: decision.confidence_explanation,
    },
    comparison_rows,
    comparison_snapshot,
    dominant_driver: decision.dominant_driver,
    action_plan: decision.action_plan,
    recommended_action: decision.recommended_action,
    insight,
    action_hint,
  };
}

