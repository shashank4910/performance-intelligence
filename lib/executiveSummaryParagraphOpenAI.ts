/**
 * Founder-facing executive summary: one continuous narrative from engine inputs only.
 * dominantStage / worstMetricGroup / contributingSignals + revenue exposure tone are not rendered alone.
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
    return `users drop before engaging because ${constraint} breaks the first impression`;
  }
  if (stage === "interaction") {
    return `users drop during taps and scrolling because ${constraint} makes progress feel stalled`;
  }
  return `users drop near completion because ${constraint} weakens trust at decision time`;
}

function businessImpactLine(stage: "load" | "interaction" | "conversion", severity: "low" | "medium" | "high"): string {
  const severityPrefix =
    severity === "high"
      ? "This is a direct revenue leak"
      : severity === "medium"
        ? "This is suppressing conversion momentum"
        : "This is limiting conversion efficiency";

  if (stage === "load") return `${severityPrefix} because visitors leave before meaningful engagement starts`;
  if (stage === "interaction") return `${severityPrefix} because active sessions fail to progress toward key actions`;
  return `${severityPrefix} because decision-stage users hesitate and abandon before conversion`;
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

/** Avoid multi-line template literals in this file (Turbopack/SWC parse quirks with long prompts). */
const SYSTEM = [
  "You are a CTO-level performance advisor.",
  "",
  "Your job is to explain what is happening on the website in clear, simple English.",
  "",
  "You must:",
  "- Speak like a human, not an AI",
  "- Be direct and specific",
  "- Avoid vague or generic phrases",
  "- Focus on user behavior and business impact",
  "- Clearly state where users are dropping",
  "- Clearly state why",
  "- Clearly state what to fix first",
  "",
  "Write ONE continuous paragraph (NOT multiple paragraphs).",
  "",
  "Length: 180–260 words.",
  "",
  "Do NOT use:",
  "- 'the data suggests'",
  "- 'based on'",
  "- 'analysis shows'",
  "- 'in conclusion'",
  "- any filler language",
  "",
  "Do NOT repeat sentences.",
  "",
  "Make it feel like a real expert explaining the problem.",
].join("\n");

function userMessage(engine: FounderExecutiveEngineInput): string {
  const payload = JSON.stringify(engine, null, 2);
  return (
    "CONTEXT (meaning only — do not echo keys or JSON to the reader):\n" +
    payload +
    "\n\n" +
    "stage meanings: load = before users settle into the page, interaction = during taps and scrolling, conversion = when they try to complete value actions.\n" +
    "Write the narrative now."
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
    .replace(/�\?\?/g, "'")
    .replace(/�/g, "")
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

const MIN_ACCEPTABLE_WORDS = 150;
const MAX_ACCEPTABLE_WORDS = 260;
const BANNED_PHRASES = ["the data suggests", "based on", "analysis shows", "in conclusion"];

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

function hasStageMention(text: string): boolean {
  return /\b(load|interaction|conversion)\b/i.test(text);
}

function hasConstraintMention(text: string, engine: FounderExecutiveEngineInput): boolean {
  const t = text.toLowerCase();
  const phrases = [engine.primary_constraint.toLowerCase(), "responsiveness", "stability", "load"];
  return phrases.some((p) => t.includes(p));
}

function hasActionDirective(text: string): boolean {
  return /\b(focus on|start by|prioritize|fix first|address)\b/i.test(text);
}

function hasRequiredStructure(text: string, engine: FounderExecutiveEngineInput): boolean {
  return hasStageMention(text) && hasConstraintMention(text, engine) && hasActionDirective(text);
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

function stageDisplay(stage: "load" | "interaction" | "conversion"): string {
  if (stage === "load") return "load";
  if (stage === "interaction") return "interaction";
  return "conversion";
}

function buildDeterministicFallbackParagraph(engine: FounderExecutiveEngineInput, deterministicFallback: string): string {
  const stage = stageDisplay(engine.dominant_stage);
  const topFactor = engine.contributing_factors[0] ?? "the highest-friction journey points";
  const orderedStages = engine.priority_order.map(stageDisplay).join(" then ");
  const genericAction =
    engine.primary_constraint === "interaction responsiveness"
      ? "start by reducing interaction lag on taps and scrolls"
      : engine.primary_constraint === "first-load readiness"
        ? "start by improving first-load readiness on entry pages"
        : "start by stabilizing key screens during decision flows";

  const fallback = [
    `Users are dropping during the ${stage} stage because ${engine.primary_constraint} is the main constraint in the journey.`,
    `${engine.user_behavior_breakpoint.charAt(0).toUpperCase()}${engine.user_behavior_breakpoint.slice(1)}, and ${engine.business_impact.toLowerCase()}.`,
    `The strongest contributing factor right now is ${topFactor}, and the practical priority order is ${orderedStages}.`,
    `Focus on this sequence first and ${genericAction} so users can move forward with confidence.`,
  ].join(" ");

  const deterministicHint = sanitizePlaintextParagraphs(deterministicFallback);
  const merged =
    deterministicHint.length > 0
      ? `${fallback} ${deterministicHint}`
      : fallback;
  return normalizeNarrativeWhitespace(sanitizeEncoding(merged));
}

export type ExecutiveSummaryParagraphDebug = {
  /** Verbatim `message.content` from the chat completion (before post-processing). */
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

/**
 * Single narrative for the dashboard. One model call; minimal gate (non-empty, enough words) or deterministic fallback.
 * When `EXEC_SUMMARY_DEBUG=1`, also returns `debug` with RAW vs FINAL (see types).
 */
export async function generateExecutiveSummaryParagraph(
  client: OpenAI,
  engine: FounderExecutiveEngineInput,
  deterministicFallback: string
): Promise<GenerateExecutiveSummaryParagraphResult> {
  const fallback = buildDeterministicFallbackParagraph(engine, deterministicFallback);

  if (!getEnv("OPENAI_API_KEY")) {
    return withParagraphDebug(fallback, null, true);
  }

  try {
    const requestNarrative = async (extraInstruction?: string): Promise<string | null> => {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.38,
        max_tokens: 560,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: extraInstruction
              ? `${userMessage(engine)}\n\n${extraInstruction}`
              : userMessage(engine),
          },
        ],
      });
      return completion.choices[0]?.message?.content ?? null;
    };

    const rawAiVerbatim = await requestNarrative();
    const raw = rawAiVerbatim?.trim();
    if (!raw) return withParagraphDebug(fallback, rawAiVerbatim, true);

    const cleaned = raw
      .replace(new RegExp("^```[\\s\\S]*?```$", "m"), "")
      .replace(/^markdown\n/i, "")
      .trim();
    const utf8Clean = sanitizeEncoding(cleaned);
    const normalized = normalizeNarrativeWhitespace(utf8Clean);
    const firstPassAcceptable =
      isAcceptableNarrative(normalized) && hasRequiredStructure(normalized, engine);

    if (firstPassAcceptable) {
      return withParagraphDebug(normalized, rawAiVerbatim, false);
    }

    const retryRaw = await requestNarrative(
      "Retry once. Ensure you explicitly mention load, interaction, or conversion stage, include the core constraint, and include a direct action lead-in such as 'focus on' or 'start by'."
    );
    const retryTrimmed = retryRaw?.trim();
    if (!retryTrimmed) return withParagraphDebug(fallback, rawAiVerbatim, true);

    const retryCleaned = retryTrimmed
      .replace(new RegExp("^```[\\s\\S]*?```$", "m"), "")
      .replace(/^markdown\n/i, "")
      .trim();
    const retryNormalized = normalizeNarrativeWhitespace(sanitizeEncoding(retryCleaned));
    const retryAcceptable =
      isAcceptableNarrative(retryNormalized) && hasRequiredStructure(retryNormalized, engine);

    if (retryAcceptable) {
      return withParagraphDebug(retryNormalized, retryRaw, false);
    }

    return withParagraphDebug(fallback, retryRaw ?? rawAiVerbatim, true);
  } catch (e) {
    console.error("[executive-summary-paragraph]", e);
    return withParagraphDebug(fallback, null, true);
  }
}
