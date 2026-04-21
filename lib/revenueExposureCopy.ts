/**
 * UI copy for "Revenue Exposure" — contextual line from API level + risk breakdown.
 * Does not affect scoring; display-only.
 */

export type RiskBreakdownForExposure = {
  speed_risk_score?: number;
  ux_risk_score?: number;
  conversion_risk_score?: number;
};

function normalizeExposureLevel(
  revenueRiskLevel: string | undefined,
  businessImpactLevel: string | undefined
): string {
  const r = (revenueRiskLevel ?? "").toLowerCase();
  if (r === "critical" || r === "high" || r === "moderate" || r === "low") return r;
  const b = (businessImpactLevel ?? "").toLowerCase();
  if (b.includes("critical") || b.includes("severe")) return "critical";
  if (b.includes("significant")) return "high";
  if (b.includes("moderate")) return "moderate";
  if (b.includes("minimal")) return "low";
  return "moderate";
}

function driverPhrases(rb: RiskBreakdownForExposure | undefined): string {
  if (!rb) return "speed and interaction";
  const s = rb.speed_risk_score ?? 0;
  const u = rb.ux_risk_score ?? 0;
  const c = rb.conversion_risk_score ?? 0;
  const parts: string[] = [];
  if (s >= 50) parts.push("slow speed");
  if (u >= 50) parts.push("interaction delays");
  if (parts.length < 2 && c >= 50) parts.push("conversion friction");
  if (parts.length === 0) {
    const max = Math.max(s, u, c);
    if (max === s && s > 25) parts.push("load speed");
    else if (max === u && u > 25) parts.push("interaction delays");
    else if (max === c && c > 25) parts.push("conversion friction");
    else parts.push("speed and interaction");
  }
  return parts.slice(0, 2).join(" and ");
}

export function revenueExposureContextLine(
  revenueRiskLevel: string | undefined,
  businessImpactLevel: string | undefined,
  riskBreakdown: RiskBreakdownForExposure | undefined
): string {
  const level = normalizeExposureLevel(revenueRiskLevel, businessImpactLevel);
  const drivers = driverPhrases(riskBreakdown);
  if (level === "critical") return `Critical revenue exposure due to ${drivers}.`;
  if (level === "high") return `High revenue exposure due to ${drivers}.`;
  if (level === "moderate") return `Moderate revenue exposure — ${drivers} are still affecting revenue.`;
  if (level === "low") return `Low revenue exposure — performance is unlikely to be the main revenue drag right now.`;
  return `Revenue exposure reflects your current performance risk profile.`;
}
