/**
 * Dashboard-only copy helpers for Website Health (no engine / model logic).
 */

/** One muted freshness line for the Website Health card (no heavy timestamps). */
export function analysisFreshnessCaption(analyzedAt: string | undefined | null): string {
  if (analyzedAt == null || analyzedAt === "") return "Based on your latest run.";
  const parsed = new Date(analyzedAt);
  if (Number.isNaN(parsed.getTime())) return "Based on your latest run.";

  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  if (diffMs < 0) return "Based on your latest run.";

  const sameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();
  if (sameDay) return "Last updated today.";

  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs < dayMs) return "Last updated in the past day.";
  if (diffMs < 7 * dayMs) return "Last updated in the past week.";

  return `Last updated ${parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.`;
}

/**
 * Rule-based status line aligned with the headline score on a 0–10 scale
 * (`overallHealth` 0–100 → displayed as X/10).
 */
export function websiteHealthInterpretationLine(healthScore100: number): string {
  if (!Number.isFinite(healthScore100) || healthScore100 <= 0) {
    return "Severe performance issues detected";
  }
  const score10 = healthScore100 / 10;
  if (score10 < 4) return "Severe performance issues detected";
  if (score10 <= 7) return "Performance needs improvement";
  return "Healthy performance";
}
