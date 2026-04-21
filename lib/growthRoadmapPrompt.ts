/**
 * AI prompt structure for Growth Impact Roadmap explanation layer.
 * Phrasing only — no recalculation, no change to numeric logic or ranking.
 */

export type GrowthRoadmapAIInput = {
  domainName: string;
  riskLabel: string;
  impactIndex: number;
  topMetrics: string[];
  competitiveGap: number | null;
};

export const GROWTH_ROADMAP_SYSTEM_PROMPT = `You are an executive performance strategy assistant for the Growth Impact Roadmap.
You MUST use only the provided labels and numbers. Do not recalculate scores. Do not modify impact index or ranking.
Output exactly one short paragraph (max 2 sentences) that:
1. Explains why this domain matters for growth.
2. States what fixing it influences (use the top metrics list).
3. Notes strategic importance; if competitive gap is provided and negative, mention closing the gap with competitors.
Keep tone professional and actionable. No bullet lists. No invented numbers.`;

export function buildGrowthRoadmapUserPrompt(input: GrowthRoadmapAIInput): string {
  const lines = [
    `Domain: ${input.domainName}`,
    `Risk label: ${input.riskLabel}`,
    `Impact Index: ${input.impactIndex}`,
    `Top contributing metrics: ${input.topMetrics.slice(0, 3).join(", ")}`,
  ];
  if (input.competitiveGap != null) {
    lines.push(`Competitive gap (your score minus competitor avg): ${input.competitiveGap}`);
  }
  return lines.join("\n");
}
