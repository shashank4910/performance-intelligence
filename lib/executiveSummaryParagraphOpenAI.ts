/**
 * Founder-facing executive summary: one continuous narrative from engine inputs only.
 * Narrative mode (POSITIVE / BALANCED / NEGATIVE) is decided by the system — not the LLM.
 */

import OpenAI from "openai";
import { getEnv, isExecSummaryDebugEnabled } from "@/lib/env";
import {
  computeStageMetricWeights,
  revenueStageSnapshotFromAnalyzeData,
} from "@/lib/revenueStageDistribution";
import { dominantStageFromImpacts } from "@/lib/systemDiagnosis";
import { buildPrimaryConstraintPresentationInputFromAnalyzeData } from "@/lib/primaryConstraint";
import { strongestConstraintAxis } from "@/lib/primaryConstraintPresentation";
import { contributingSignalsFromFixPriorities } from "@/lib/aiExecutiveSummary";
import {
  validateNarrativeConsistency,
  type ExecutiveNarrativeContext,
  type NarrativeMode,
} from "@/lib/executiveNarrativeContext";

export type FounderExecutiveEngineInput = {
  dominant_stage: "load" | "interaction" | "conversion";
  severity_level: "low" | "medium" | "high";
  primary_constraint: string;
  user_behavior_breakpoint: string;
  business_impact: string;
  contributing_factors: string[];
  priority_order: Array<"load" | "interaction" | "conversion">;
  confidence: "low" | "medium" | "high";
};

export type AnalyzeLikeForFounderExec = {
  estimatedMonthlyLeak?: number;
  revenueImpactInputs?: { lcpSeconds?: number; cls?: number; inpMs?: number | null } | null;
  detailed_metrics?: Record<string, unknown> | null;
  fix_priorities?: Array<{ category?: string }> | null;
};

function riskLevelToSeverity(level: "Low" | "Medium" | "High"): "low" | "medium" | "high" {
  if (level === "High") return "high";
  if (level === "Medium") return "medium";
  return "low";
}

function mapDominantStage(stage: "landing" | "interaction" | "conversion"): "load" | "interaction" | "conversion" {
  if (stage === "landing") return "load";
  return stage;
}

function mapConstraint(axis: "speed" | "interaction" | "stability"): string {
  if (axis === "speed") return "first-load readiness";
  if (axis === "interaction") return "interaction responsiveness";
  return "visual and behavioral stability";
}

function behaviorBreakpoint(stage: "load" | "interaction" | "conversion", constraint: string): string {
  if (stage === "load") {
    return `visitors can disengage early when ${constraint} weakens the first impression`;
  }
  if (stage === "interaction") {
    return `progress can stall when ${constraint} makes taps and scrolling feel heavy`;
  }
  return `decision-stage users can hesitate when ${constraint} weakens trust near completion`;
}

function businessImpactLine(stage: "load" | "interaction" | "conversion", severity: "low" | "medium" | "high"): string {
  const severityPrefix =
    severity === "high"
      ? "There is meaningful pressure on conversion while this bottleneck persists"
      : severity === "medium"
        ? "This is softening conversion momentum"
        : "This is gently capping conversion efficiency";

  if (stage === "load") return `${severityPrefix} because early engagement does not get a strong runway`;
  if (stage === "interaction") return `${severityPrefix} because mid-journey flow does not feel effortless`;
  return `${severityPrefix} because completion steps do not feel fully trustworthy`;
}

function rankedPriorityOrder(weights: ReturnType<typeof computeStageMetricWeights>): Array<"load" | "interaction" | "conversion"> {
  const pairs: Array<{ key: "load" | "interaction" | "conversion"; value: number }> = [
    { key: "load", value: weights.landing },
    { key: "interaction", value: weights.interaction },
    { key: "conversion", value: weights.conversion },
  ];
  return pairs.sort((a, b) => b.value - a.value).map((x) => x.key);
}

function confidenceFromSignals(
  severity: "low" | "medium" | "high",
  factors: string[],
  weights: ReturnType<typeof computeStageMetricWeights>
): "low" | "medium" | "high" {
  const maxStageWeight = Math.max(weights.landing, weights.interaction, weights.conversion);
  if (severity === "high" && factors.length >= 2 && maxStageWeight >= 0.5) return "high";
  if (severity === "low" && factors.length <= 1 && maxStageWeight < 0.38) return "low";
  return "medium";
}

/** Legacy structured engine input (kept for callers); prefer `buildExecutiveNarrativeContext` for new work. */
export function buildFounderExecutiveInputsFromAnalyzeData(
  data: AnalyzeLikeForFounderExec,
  riskLevel: "Low" | "Medium" | "High"
): FounderExecutiveEngineInput {
  const snapshot = revenueStageSnapshotFromAnalyzeData(
    data as Parameters<typeof revenueStageSnapshotFromAnalyzeData>[0]
  );
  const w = computeStageMetricWeights(snapshot);
  const dominantStage = mapDominantStage(dominantStageFromImpacts(w.landing, w.interaction, w.conversion));
  const primary = buildPrimaryConstraintPresentationInputFromAnalyzeData(
    data as Parameters<typeof buildPrimaryConstraintPresentationInputFromAnalyzeData>[0]
  );
  const worstMetricGroup = strongestConstraintAxis(primary);
  const severity = riskLevelToSeverity(riskLevel);
  const primaryConstraint = mapConstraint(worstMetricGroup);
  const contributingSignals = contributingSignalsFromFixPriorities(data.fix_priorities);
  const priorityOrder = rankedPriorityOrder(w);
  const confidence = confidenceFromSignals(severity, contributingSignals, w);

  return {
    dominant_stage: dominantStage,
    severity_level: severity,
    primary_constraint: primaryConstraint,
    user_behavior_breakpoint: behaviorBreakpoint(dominantStage, primaryConstraint),
    business_impact: businessImpactLine(dominantStage, severity),
    contributing_factors: contributingSignals,
    priority_order: priorityOrder,
    confidence,
  };
}

function buildStructuredSystemPrompt(mode: NarrativeMode): string {
  const modeBlock =
    mode === "POSITIVE"
      ? "MODE IS POSITIVE: emphasize stability and a smooth experience. Frame issues as minor. Do NOT use: serious, critical, leak, alarming, urgent crisis, users are dropping."
      : mode === "BALANCED"
        ? "MODE IS BALANCED: show both strengths and weaknesses. Avoid extreme language. Do not use the phrase serious revenue leak."
        : "MODE IS NEGATIVE: be direct about business risk and what to fix; urgency is appropriate.";

  return [
    "You are a CTO-level advisor explaining website performance to a founder.",
    "",
    "Write a clear, simple executive summary as ONE continuous piece of prose (natural paragraph flow, not fragmented lines).",
    "",
    modeBlock,
    "",
    "STRICT RULES:",
    "- Plain English only (no jargon acronyms, no lab metric names).",
    "- No AI tone or generic filler.",
    "- No exaggeration beyond what the MODE allows.",
    "- No digits or percentages.",
    "- Do not write: analysis shows, based on data, in conclusion, the data suggests, based on, leverage, optimize performance.",
    "",
    "STRUCTURE (one flowing narrative — five beats in order, without headings):",
    "Beat — overall state aligned with MODE.",
    "Beat — what is working well (when strengths exist; for POSITIVE mode this must feel genuine).",
    "Beat — where users may feel friction.",
    "Beat — business impact on engagement and conversion.",
    "Beat — what to prioritize next (omit only when MODE is POSITIVE and the situation is clearly low-urgency).",
    "",
    "LENGTH: 180–220 words.",
    "",
    "Do NOT repeat sentences.",
  ].join("\n");
}

function userMessageForContext(ctx: ExecutiveNarrativeContext): string {
  const slim = {
    mode: ctx.mode,
    tone: ctx.narrative_rules.tone,
    allow_urgency: ctx.narrative_rules.allow_urgency,
    allow_revenue_leak_language: ctx.narrative_rules.allow_revenue_leak_language,
    focus: [...ctx.narrative_rules.focus],
    overall_health_score: ctx.overall_health_score,
    revenue_exposure_level: ctx.revenue_exposure_level,
    dominant_stage: ctx.dominant_stage,
    worst_metric_group: ctx.worst_metric_group,
    contributing_signals: ctx.contributing_signals,
    strengths: ctx.strengths,
    weaknesses: ctx.weaknesses,
    business_impact_level: ctx.business_impact_level,
  };
  return (
    "STRUCTURED WRITING TASK — write the founder-facing executive summary from this ENGINE CONTEXT only.\n" +
    "Do not invent a new diagnosis; stay inside these signals.\n" +
    "Do not restate metric names, numbers, or percentages.\n\n" +
    JSON.stringify(slim, null, 2) +
    "\n\nWrite the narrative now."
  );
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sanitizePlaintextParagraphs(text: string): string {
  return text
    .replace(/\b(lcp|inp|cls|tbt|tti|fcp|fid|si|ttfb|cwv|psi)\b/gi, "")
    .replace(/\d[\d.,]*/g, "")
    .replace(/%/g, "")
    .replace(/\bms\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeEncoding(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\uFFFD/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, "")
    .trim();
}

function normalizeNarrativeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_ACCEPTABLE_WORDS = 180;
const MAX_ACCEPTABLE_WORDS = 220;
const BANNED_PHRASES = [
  "the data suggests",
  "based on",
  "analysis shows",
  "in conclusion",
  "based on data",
];

function normalizeSentenceSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDuplicateSentences(text: string): boolean {
  const seen = new Set<string>();
  const sentences = text
    .split(/[.!?]+/g)
    .map((x) => normalizeSentenceSignature(x))
    .filter((x) => x.length > 0);

  for (const s of sentences) {
    if (seen.has(s)) return true;
    seen.add(s);
  }
  return false;
}

function hasBannedPhrase(text: string): boolean {
  const t = text.toLowerCase();
  return BANNED_PHRASES.some((p) => t.includes(p));
}

function isAcceptableNarrative(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const words = wordCount(t);
  if (words < MIN_ACCEPTABLE_WORDS || words > MAX_ACCEPTABLE_WORDS) return false;
  if (hasDuplicateSentences(t)) return false;
  if (hasBannedPhrase(t)) return false;
  return true;
}

function stagePlain(ctx: ExecutiveNarrativeContext): string {
  if (ctx.dominant_stage === "load") return "when people first land";
  if (ctx.dominant_stage === "interaction") return "during active use";
  return "near completion";
}

function constraintPlain(ctx: ExecutiveNarrativeContext): string {
  if (ctx.worst_metric_group === "speed") return "first-load readiness";
  if (ctx.worst_metric_group === "interaction") return "interaction responsiveness";
  return "visual and behavioral stability";
}

function buildDeterministicFallbackFromContext(
  ctx: ExecutiveNarrativeContext,
  deterministicFallback: string
): string {
  const det = sanitizePlaintextParagraphs(deterministicFallback);
  const stage = stagePlain(ctx);
  const constraint = constraintPlain(ctx);
  const s0 = ctx.strengths[0] ?? "the baseline experience looks steady for most visits";
  const w0 = ctx.weaknesses[0] ?? "a few polish opportunities still deserve attention";

  if (ctx.mode === "POSITIVE") {
    const body = [
      `Overall the experience sits in a reassuring band: most visitors should see a calm journey with room to refine details, especially ${stage}.`,
      `What is working well: ${s0}`,
      `Where friction can still appear: ${w0} — treat it as incremental tuning rather than a crisis.`,
      `Business impact should stay contained while you keep improvements small and focused on ${constraint}.`,
    ].join(" ");
    const merged = det.length > 40 ? `${body} ${det}` : body;
    return normalizeNarrativeWhitespace(sanitizeEncoding(merged));
  }

  if (ctx.mode === "BALANCED") {
    const body = [
      `The picture is mixed: there are real strengths alongside friction that still shapes outcomes, especially ${stage}.`,
      `Strengths include ${s0}`,
      `Friction shows up around ${w0}`,
      `For the business, this reads as uneven momentum until the sharpest issues around ${constraint} are reduced.`,
      `Prioritize the next fixes that tighten the journey without overreacting.`,
    ].join(" ");
    const merged = det.length > 40 ? `${body} ${det}` : body;
    return normalizeNarrativeWhitespace(sanitizeEncoding(merged));
  }

  const body = [
    `The journey carries clear business risk ${stage}, and ${constraint} is the main constraint users feel.`,
    `Contributing pressure includes ${ctx.contributing_signals[0] ?? "multiple friction points"}.`,
    `Strengths are limited right now; ${s0} is not enough to offset ${w0}.`,
    `Business impact is material until the bottleneck is addressed.`,
    `Start by fixing the highest-friction steps so completion feels trustworthy again.`,
  ].join(" ");

  const merged = det.length > 40 ? `${body} ${det}` : body;
  return normalizeNarrativeWhitespace(sanitizeEncoding(merged));
}

export type ExecutiveSummaryParagraphDebug = {
  RAW_AI_SUMMARY: string | null;
  FINAL_SUMMARY: string;
  usedFallback: boolean;
};

export type GenerateExecutiveSummaryParagraphResult = {
  summary: string;
  debug?: ExecutiveSummaryParagraphDebug;
};

function execSummaryDebugEnabled(): boolean {
  return isExecSummaryDebugEnabled();
}

function withParagraphDebug(
  final: string,
  rawAi: string | null,
  usedFallback: boolean
): GenerateExecutiveSummaryParagraphResult {
  if (!execSummaryDebugEnabled()) {
    return { summary: final };
  }
  return {
    summary: final,
    debug: {
      RAW_AI_SUMMARY: rawAi,
      FINAL_SUMMARY: final,
      usedFallback,
    },
  };
}

function postProcess(raw: string): string {
  const cleaned = raw
    .replace(new RegExp("^```[\\s\\S]*?```$", "m"), "")
    .replace(/^markdown\n/i, "")
    .trim();
  const utf8Clean = sanitizeEncoding(cleaned);
  return normalizeNarrativeWhitespace(utf8Clean);
}

/**
 * Single narrative for the dashboard. Mode and facts come from `ExecutiveNarrativeContext`; the LLM only writes prose.
 */
export async function generateExecutiveSummaryParagraph(
  client: OpenAI,
  context: ExecutiveNarrativeContext,
  deterministicFallback: string
): Promise<GenerateExecutiveSummaryParagraphResult> {
  const fallback = buildDeterministicFallbackFromContext(context, deterministicFallback);
  const system = buildStructuredSystemPrompt(context.mode);

  if (!getEnv("OPENAI_API_KEY")) {
    return withParagraphDebug(fallback, null, true);
  }

  try {
    const requestNarrative = async (extraInstruction?: string): Promise<string | null> => {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.32,
        max_tokens: 520,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: extraInstruction
              ? `${userMessageForContext(context)}\n\n${extraInstruction}`
              : userMessageForContext(context),
          },
        ],
      });
      return completion.choices[0]?.message?.content ?? null;
    };

    const processAttempt = (rawAiVerbatim: string | null) => {
      const raw = rawAiVerbatim?.trim();
      if (!raw) return { text: null as string | null, rawAiVerbatim, wordsOk: false, consistency: { ok: true } as const };
      const normalized = postProcess(raw);
      const wordsOk = isAcceptableNarrative(normalized);
      const consistency = validateNarrativeConsistency(normalized, context);
      const ok = wordsOk && consistency.ok;
      return { text: ok ? normalized : null, rawAiVerbatim, wordsOk, consistency };
    };

    const firstRaw = await requestNarrative();
    const first = processAttempt(firstRaw);
    if (first.text) {
      return withParagraphDebug(first.text, firstRaw, false);
    }

    const hints: string[] = [];
    if (!first.text && firstRaw) {
      if (!first.wordsOk) {
        hints.push(`Rewrite: length must be ${MIN_ACCEPTABLE_WORDS}–${MAX_ACCEPTABLE_WORDS} words, one continuous narrative.`);
      }
      if (first.consistency.ok === false) {
        hints.push(`Narrative consistency failed (${first.consistency.reason}). Follow MODE rules strictly.`);
      }
    }
    const retryRaw = await requestNarrative(
      hints.length > 0
        ? hints.join(" ")
        : "Rewrite once: meet word count, MODE rules, and banned-phrase rules."
    );
    const second = processAttempt(retryRaw);
    if (second.text) {
      return withParagraphDebug(second.text, retryRaw, false);
    }

    return withParagraphDebug(fallback, retryRaw ?? firstRaw, true);
  } catch (e) {
    console.error("[executive-summary-paragraph]", e);
    return withParagraphDebug(fallback, null, true);
  }
}
