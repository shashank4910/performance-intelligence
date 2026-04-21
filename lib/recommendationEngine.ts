/**
 * Simple Recommendation Layer — rule-based mapping only. No AI.
 */

export type ResourceContext = {
  resourceName: string;
  domain: string;
  queueTime: number;
  blockingTime: number;
  criticalPath: boolean;
  size: number;
  metricImpact: string[];
};

export type SimpleRecommendation = {
  action: string;
  why: string;
  impact: string;
  technicalDetails: string[];
};

function addMetricImpactSuffix(impact: string, metricImpact: string[]): string {
  const hasLCP = metricImpact.some((m) => m.toUpperCase() === "LCP");
  const hasINP = metricImpact.some((m) => m.toUpperCase() === "INP");
  const parts = [impact];
  if (hasLCP) parts.push("This directly affects your first impression speed.");
  if (hasINP) parts.push("This affects how quickly users can interact.");
  return parts.join(" ");
}

export function generateSimpleRecommendation(resourceContext: ResourceContext): SimpleRecommendation {
  const { queueTime, blockingTime, criticalPath, size, metricImpact } = resourceContext;
  const technicalDetails: string[] = [];

  let action = "";
  let why = "";
  let impact = "";

  if (criticalPath === false && queueTime > 300) {
    action = "Load this script only when it is actually needed.";
    why = "It is not required for the first impression but is delaying other important files.";
    impact = "Improves initial page speed and reduces waiting time.";
    technicalDetails.push("Consider adding defer or async to the script tag.");
    technicalDetails.push("Consider dynamic import when the feature is needed.");
  }

  if (blockingTime > 150) {
    if (!action) {
      action = "Delay this script until after the main content appears.";
      why = "It is slowing down how quickly users can see and interact with your page.";
      impact = "Helps improve perceived performance and interaction speed.";
    }
    technicalDetails.push("Consider adding defer or async to the script tag.");
    technicalDetails.push("Consider moving below-the-fold or lazy-loading.");
  }

  if (size > 150 * 1024) {
    if (!action) {
      action = "Reduce or replace this large file with a lighter alternative.";
      why = "Large files take longer to download and slow down loading.";
      impact = "Improves overall load time and user experience.";
    }
    technicalDetails.push("Consider bundling or code-splitting if using HTTP/1.1.");
  }

  if (!action) {
    action = "Review this resource for optimization opportunities.";
    why = "Small improvements can add up across the page.";
    impact = "May improve load and interaction metrics.";
    technicalDetails.push("Consider adding defer or async if applicable.");
    technicalDetails.push("Consider dynamic import for non-critical code.");
    technicalDetails.push("Consider moving below the fold if not needed for first paint.");
    technicalDetails.push("Consider bundling if many small requests (HTTP/1.1).");
  }

  impact = addMetricImpactSuffix(impact, metricImpact);

  const uniqueTechnical = [...new Set(technicalDetails)];
  return { action, why, impact, technicalDetails: uniqueTechnical };
}
