/**
 * CORTEX v3 — AI Authority validation and override layer.
 * Sits on top of CORTEX v2. Does not change v2 math; may only increase leak (cap 2x).
 */

export type CortexV3AuditInput = {
  /** CORTEX v2 calculated leak (monthly $). */
  mathLeak: number;
  /** Value per visit ($). */
  vpv: number;
  /** Business context for AI. */
  businessContext: string;
  /** Metric severity description (e.g. "30s LCP", "2.5s TTFB"). */
  metricSeverity: string;
  /** Optional: primary metric key (lcp, tti, etc.) for trust-failure rule */
  metricKey?: string;
};

export type CortexV3AuditResult = {
  adjustedLeak: number;
  rationale: string;
  trustFailureFlag: boolean;
};

const OVERRIDE_CAP_MULTIPLIER = 2;

/**
 * Enforce rules: AI may not decrease below mathLeak; cap at 2x mathLeak.
 */
export function applyCortexV3OverrideRules(mathLeak: number, aiSuggestedLeak: number): number {
  if (!Number.isFinite(mathLeak) || mathLeak < 0) return 0;
  const floor = mathLeak;
  const cap = mathLeak * OVERRIDE_CAP_MULTIPLIER;
  const raw = Number.isFinite(aiSuggestedLeak) ? aiSuggestedLeak : mathLeak;
  const clamped = Math.max(floor, Math.min(cap, raw));
  return Math.round(clamped * 100) / 100;
}

/**
 * High trust-failure risk: VPV > $5,000 and LCP > 10s (or severe visual metric).
 */
export function getTrustFailureFlag(input: CortexV3AuditInput): boolean {
  const { vpv, metricKey, metricSeverity } = input;
  if (vpv <= 5000) return false;
  const lcpMatch = metricSeverity.match(/(\d+(?:\.\d+)?)\s*s/);
  const lcpSeconds = lcpMatch ? parseFloat(lcpMatch[1]) : 0;
  if (metricKey === "lcp" && lcpSeconds >= 10) return true;
  if (metricKey === "fcp" && lcpSeconds >= 8) return true;
  if (metricKey === "speedIndex" && lcpSeconds >= 10) return true;
  return false;
}

/**
 * Build prompt for AI CFO evaluation. Call from API route with OpenAI.
 */
export function getCortexV3AuditPrompt(input: CortexV3AuditInput): string {
  const { mathLeak, vpv, businessContext, metricSeverity } = input;
  const trustFailure = getTrustFailureFlag(input);
  return `You are a Chief Financial Officer evaluating performance risk.
The deterministic model estimates $${Math.round(mathLeak)} monthly leak.
VPV is $${vpv.toLocaleString("en-US", { maximumFractionDigits: 0 })}.
Context: ${businessContext}.
Metric severity: ${metricSeverity}.
${trustFailure ? "This scenario indicates high brand trust failure risk (high VPV and severe metric)." : ""}

If brand trust failure risk exceeds mathematical abandonment, you may recommend an override to reflect real-world revenue destruction.
Rules: You may recommend an INCREASE only, never below the model estimate. Maximum override is 2x the model estimate ($${Math.round(mathLeak * OVERRIDE_CAP_MULTIPLIER)}).

Reply in JSON only, no markdown:
{"adjustedLeak": number, "rationale": "one short sentence"}`;
}

/**
 * Parse AI response and apply override rules. Returns safe result.
 */
export function parseAndApplyCortexV3Response(
  input: CortexV3AuditInput,
  aiContent: string | null | undefined
): CortexV3AuditResult {
  const mathLeak = input.mathLeak;
  const trustFailureFlag = getTrustFailureFlag(input);
  let adjustedLeak = mathLeak;
  let rationale = "Deterministic model used; no override applied.";

  if (aiContent && typeof aiContent === "string") {
    const trimmed = aiContent.trim().replace(/^```\w*\n?|\n?```$/g, "").trim();
    try {
      const parsed = JSON.parse(trimmed) as { adjustedLeak?: number; rationale?: string };
      const raw = typeof parsed.adjustedLeak === "number" ? parsed.adjustedLeak : mathLeak;
      adjustedLeak = applyCortexV3OverrideRules(mathLeak, raw);
      if (typeof parsed.rationale === "string" && parsed.rationale.length > 0) {
        rationale = parsed.rationale;
      }
    } catch {
      // Keep mathLeak and default rationale
    }
  }

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("--- CORTEX v3 AUDIT ---\nMath: $" + mathLeak + "\nAI Adjusted: $" + adjustedLeak + "\nTrust Failure: " + trustFailureFlag);
  }

  return { adjustedLeak, rationale, trustFailureFlag };
}

/**
 * Run CORTEX v3 audit. When apiUrl provided and fetch succeeds, uses AI; otherwise returns deterministic result.
 */
export async function runCortexV3Audit(
  input: CortexV3AuditInput,
  options?: { apiUrl?: string }
): Promise<CortexV3AuditResult> {
  const trustFailureFlag = getTrustFailureFlag(input);
  const fallback: CortexV3AuditResult = {
    adjustedLeak: input.mathLeak,
    rationale: "Deterministic model used; no override applied.",
    trustFailureFlag,
  };

  const url = options?.apiUrl ?? (typeof window !== "undefined" ? "/api/cortex-v3-audit" : undefined);
  if (!url) return fallback;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { adjustedLeak?: number; rationale?: string; trustFailureFlag?: boolean };
    if (typeof data.adjustedLeak === "number" && Number.isFinite(data.adjustedLeak)) {
      const adjustedLeak = applyCortexV3OverrideRules(input.mathLeak, data.adjustedLeak);
      return {
        adjustedLeak,
        rationale: typeof data.rationale === "string" ? data.rationale : fallback.rationale,
        trustFailureFlag: Boolean(data.trustFailureFlag),
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}
