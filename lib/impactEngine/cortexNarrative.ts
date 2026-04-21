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
 * CORTEX v2 — AI-Powered Impact Narrative Engine.
 * Psychologically grounded revenue explanations. Deterministic fallback when AI unavailable.
 */

import type { CortexStage } from "./cortexV2";

export function formatCurrencyForNarrative(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export type ImpactNarrativeInput = {
  stage: CortexStage;
  resourceLeak: number;
  metricValue?: string | number;
  context?: string;
};

/**
 * Deterministic fallback: stage-based narrative with exact dollar value.
 * No hype, no technical jargon. Business-focused, one paragraph.
 */
export function getImpactNarrativeFallback(input: ImpactNarrativeInput): string {
  const { stage, resourceLeak } = input;
  const amount = formatCurrencyForNarrative(resourceLeak);

  switch (stage) {
    case "VISUAL_ENTRY":
      return `This resource is responsible for ${amount} per month in Visual Abandonment, where users bounce when the page appears broken or slow.`;
    case "INTERACTION":
      return `Costing you ${amount} per month in Interaction Paralysis, as users abandon when the interface fails to respond instantly.`;
    case "TRUST":
      return `Driving ${amount} per month in Trust Erosion, where layout instability reduces user confidence and conversion precision.`;
    case "INFRASTRUCTURE":
      return `Contributing ${amount} per month to Infrastructure Debt, compounding latency across all other performance stages.`;
    default:
      return `This resource is responsible for ${amount} per month in revenue leak tied to this performance stage.`;
  }
}

/**
 * AI prompt template for generateImpactNarrative (server-side).
 * Call from API route with OpenAI; use getImpactNarrativeFallback when AI fails or is disabled.
 */
export function getImpactNarrativePrompt(input: ImpactNarrativeInput): string {
  const amount = formatCurrencyForNarrative(input.resourceLeak);
  const stageLabel =
    input.stage === "VISUAL_ENTRY"
      ? "Visual Entry"
      : input.stage === "INTERACTION"
        ? "Interaction"
        : input.stage === "TRUST"
          ? "Trust / Stability"
          : "Infrastructure";
  return `You are a performance economics analyst.
Explain how a performance issue in the ${stageLabel} stage causes behavioral revenue loss.
Include the exact dollar value: ${amount}.
Use psychologically grounded terms such as:
- Visual Abandonment
- Interaction Paralysis
- Trust Erosion
- Infrastructure Debt

Keep it concise, authoritative, business-focused.
No hype.
No technical jargon unless necessary.
One paragraph only.`;
}
