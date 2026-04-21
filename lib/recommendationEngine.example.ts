/**
 * Example usage of the recommendation engine with one resource object.
 * Do not import in production bundle; for reference only.
 */

import { generateSimpleRecommendation, type ResourceContext } from "./recommendationEngine";

const exampleResource: ResourceContext = {
  resourceName: "main-bundle.js",
  domain: "Speed",
  queueTime: 350,
  blockingTime: 200,
  criticalPath: false,
  size: 180000,
  metricImpact: ["LCP", "INP"],
};

const recommendation = generateSimpleRecommendation(exampleResource);

// recommendation.action   → "Load this script only when it is actually needed."
// recommendation.why      → "It is not required for the first impression but is delaying other important files."
// recommendation.impact  → "Improves initial page speed and reduces waiting time. This directly affects your first impression speed. This affects how quickly users can interact."
// recommendation.technicalDetails → ["Consider adding defer or async to the script tag.", "Consider dynamic import when the feature is needed.", ...]

export { exampleResource, recommendation };
