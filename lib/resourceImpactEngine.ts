/**
 * Deterministic Resource Impact Scoring. Normalized 0–100.
 * Do not modify scoring engine or recommendation logic.
 */

export type ResourceForImpact = {
  url: string;
  type: "js" | "css" | "font" | "image" | "other";
  queueTime: number;
  blockingTime: number;
  transferSize: number;
  isCriticalPath: boolean;
  affectedMetrics: string[];
};

export type ResourceImpactResult = {
  impactScore: number;
  resource: ResourceForImpact;
};

/**
 * impactScore =
 *   (queueTime norm * 0.35) +
 *   (blockingTime norm * 0.35) +
 *   (transferSizeKB norm * 0.15) +
 *   (isCriticalPath ? 100 : 0) * 0.10 +
 *   (affectedMetrics.length * 20) * 0.05
 * Each input normalized so final score is 0–100.
 */
function normalizeToScale(value: number, max: number, weight: number): number {
  const capped = Math.min(value, max);
  return (capped / max) * weight;
}

export function computeResourceImpact(resource: ResourceForImpact): ResourceImpactResult {
  const queueTime = Math.max(0, resource.queueTime);
  const blockingTime = Math.max(0, resource.blockingTime);
  const transferSizeKB = Math.max(0, resource.transferSize / 1024);
  const metricCount = Math.min(resource.affectedMetrics.length, 5);

  const queueContrib = normalizeToScale(queueTime, 1000, 35);
  const blockingContrib = normalizeToScale(blockingTime, 1000, 35);
  const sizeContrib = normalizeToScale(transferSizeKB, 500, 15);
  const criticalContrib = resource.isCriticalPath ? 10 : 0;
  const metricsContrib = metricCount * 20 * 0.05;

  const impactScore = Math.round(
    Math.max(0, Math.min(100, queueContrib + blockingContrib + sizeContrib + criticalContrib + metricsContrib))
  );

  return { impactScore, resource };
}

export function computeResourceImpacts(resources: ResourceForImpact[]): ResourceImpactResult[] {
  return resources.map((r) => computeResourceImpact(r)).sort((a, b) => b.impactScore - a.impactScore);
}

/** Phrasing-only contextual explanation for a resource. No score changes. */
export function buildResourceImpactExplanation(result: ResourceImpactResult): string {
  const { impactScore, resource } = result;
  const metrics = resource.affectedMetrics.length ? resource.affectedMetrics.join(", ") : "core metrics";
  const typeLabel = resource.type.toUpperCase();
  if (impactScore >= 70) {
    return `This ${typeLabel} resource has high impact (${impactScore}) on ${metrics}. Optimizing or deferring it will improve perceived load and interaction speed.`;
  }
  if (impactScore >= 40) {
    return `This ${typeLabel} resource contributes moderately (${impactScore}) to ${metrics}. Consider optimizing when addressing this domain.`;
  }
  return `This ${typeLabel} resource has lower impact (${impactScore}) on ${metrics}. Address higher-impact items first.`;
}
