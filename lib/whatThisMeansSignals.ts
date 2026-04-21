import type { CompetitorAnalysisOutput, ComparisonSnapshotRow } from "@/engine/competitorAnalysis";

/** Structured signals passed to the language layer only (no new reasoning). */
export type WhatThisMeansSignals = {
  first_impression: "fast" | "slow" | "comparable";
  interaction: "smooth" | "delayed" | "comparable";
  layout: "stable" | "unstable" | "comparable";
  position: "advantage" | "behind" | "neutral";
  confidence: "high" | "medium" | "low";
};

function rowByFactor(rows: ComparisonSnapshotRow[], factor: string): ComparisonSnapshotRow | undefined {
  return rows.find((r) => r.factor === factor);
}

function mapFirstImpression(your: string): WhatThisMeansSignals["first_impression"] {
  if (your === "Faster") return "fast";
  if (your === "Slower") return "slow";
  return "comparable";
}

function mapInteraction(your: string): WhatThisMeansSignals["interaction"] {
  if (your === "Smooth") return "smooth";
  if (your === "Delayed") return "delayed";
  return "comparable";
}

/** Drop-off risk: Lower on your site = more stable perceived layout risk. */
function mapLayout(your: string): WhatThisMeansSignals["layout"] {
  if (your === "Lower") return "stable";
  if (your === "Higher") return "unstable";
  return "comparable";
}

function firstImpressionFromRow(r: ComparisonSnapshotRow): WhatThisMeansSignals["first_impression"] {
  if (r.position === "Ahead") return "fast";
  if (r.position === "Behind") return "slow";
  if (r.position === "Similar") return "comparable";
  return mapFirstImpression(r.your_site);
}

function interactionFromRow(r: ComparisonSnapshotRow): WhatThisMeansSignals["interaction"] {
  if (r.position === "Ahead") return "smooth";
  if (r.position === "Behind") return "delayed";
  if (r.position === "Similar") return "comparable";
  return mapInteraction(r.your_site);
}

function layoutFromRow(r: ComparisonSnapshotRow): WhatThisMeansSignals["layout"] {
  if (r.position === "Ahead") return "stable";
  if (r.position === "Behind") return "unstable";
  if (r.position === "Similar") return "comparable";
  return mapLayout(r.your_site);
}

function positionFromResult(result: CompetitorAnalysisOutput): WhatThisMeansSignals["position"] {
  if (result.mode === "head_to_head") {
    const st = result.comparison?.status;
    if (st === "faster") return "advantage";
    if (st === "slower") return "behind";
    return "neutral";
  }
  const s = result.competitor_summary;
  if (!s) return "neutral";
  if (s.faster_competitors > 0) return "behind";
  if (s.slower_competitors > 0 && s.faster_competitors === 0) return "advantage";
  return "neutral";
}

function confidenceFromResult(result: CompetitorAnalysisOutput): WhatThisMeansSignals["confidence"] {
  const level = result.competitive_risk?.confidence_level;
  if (level === "high" || level === "medium" || level === "low") return level;
  return result.competitive_risk?.confidence === "medium" ? "medium" : "low";
}

/**
 * Build the fixed vocabulary input for "What this means" copy from an existing competitor analysis payload.
 * Returns null if snapshot rows are missing.
 */
export function buildWhatThisMeansSignals(result: CompetitorAnalysisOutput): WhatThisMeansSignals | null {
  const rows = result.comparison_snapshot;
  if (!Array.isArray(rows) || rows.length < 3) return null;

  const r1 = rowByFactor(rows, "First impression speed");
  const r2 = rowByFactor(rows, "Interaction readiness");
  const r3 = rowByFactor(rows, "User drop-off risk");
  if (!r1 || !r2 || !r3) return null;

  return {
    first_impression: firstImpressionFromRow(r1),
    interaction: interactionFromRow(r2),
    layout: layoutFromRow(r3),
    position: positionFromResult(result),
    confidence: confidenceFromResult(result),
  };
}

/** Strip disallowed punctuation/terms if the model drifts. */
export function sanitizeWhatThisMeansText(raw: string): string {
  return raw
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, ", ")
    .replace(/→/g, " so ")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/** Avoid duplicating the section title when the narrative already includes it. */
export function stripWhatThisMeansHeader(raw: string): string {
  return raw.replace(/^\s*WHAT THIS MEANS:?\s*\n+/i, "").trim();
}
