/**
 * Maps Risk Breakdown category labels to metric component IDs for scroll navigation.
 * Keys must match Risk Breakdown titles exactly. Values must match metric card id attributes.
 */
export const riskMetricMap: Record<string, string[]> = {
  Speed: ["lcp", "ttfb", "fcp", "speedIndex"],
  UX: ["cls", "inp"],
  SEO: ["fcp"],
  Conversion: ["tti", "tbt"],
  Scaling: ["ttfb"],
};
