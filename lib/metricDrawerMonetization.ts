/**
 * CORTEX v2 Monetization Gate — tier separation logic only.
 * FREE = generic categories + neutral descriptions (no tactical copy).
 * PRO = tactical blueprint steps (used by FixBlueprintPro).
 * No revenue math; presentation only.
 */

import type { ContributingResource } from "@/lib/metricIntelligenceEngine";

export type GenericCategory =
  | "Script Optimization"
  | "Rendering Path Optimization"
  | "Layout Stability Improvements"
  | "Bundle Size Reduction"
  | "Execution Overhead Reduction"
  | "Backend Response Optimization"
  | "Asset Delivery Optimization";

export function getGenericCategoryForResource(
  engineKey: string | null,
  resource: ContributingResource
): { category: GenericCategory; neutralDescription: string } {
  const t = (resource.type || "").toLowerCase();
  const fallback: GenericCategory = "Execution Overhead Reduction";
  const neutralFallback = "This resource contributes to performance friction during load.";

  if (!engineKey) return { category: fallback, neutralDescription: neutralFallback };

  const categoryByKey: Record<string, GenericCategory> = {
    lcp: "Rendering Path Optimization",
    fcp: "Rendering Path Optimization",
    speedIndex: "Rendering Path Optimization",
    tti: "Execution Overhead Reduction",
    tbt: "Execution Overhead Reduction",
    inp: "Execution Overhead Reduction",
    mainThread: "Execution Overhead Reduction",
    bootupTime: "Execution Overhead Reduction",
    cls: "Layout Stability Improvements",
    unusedJs: "Bundle Size Reduction",
    unusedCss: "Bundle Size Reduction",
    ttfb: "Backend Response Optimization",
  };
  const category = categoryByKey[engineKey] ?? fallback;

  const neutralByKey: Record<string, string> = {
    lcp: "This resource affects how quickly the main content becomes visible.",
    fcp: "This resource affects when the first content appears.",
    speedIndex: "This resource contributes to how quickly the page fills with content.",
    tti: "This resource contributes to execution overhead during load.",
    tbt: "This resource contributes to main thread blocking and input delay.",
    inp: "This resource affects input responsiveness.",
    mainThread: "This resource contributes to main thread execution overhead.",
    bootupTime: "This resource contributes to script execution overhead during load.",
    cls: "This resource can affect layout stability as content loads.",
    unusedJs: "This resource contributes to payload size and parse cost.",
    unusedCss: "This resource contributes to payload size and render path cost.",
    ttfb: "This resource affects server response timing.",
  };
  const neutralDescription = neutralByKey[engineKey] ?? neutralFallback;

  return { category, neutralDescription };
}

export type FixBlueprintSteps = {
  step1: string;
  step2: string;
  step3: string;
};

function step3Recover(metricShortName: string, resourceLeak: number): string {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(resourceLeak);
  return `Recover ${amount} in ${metricShortName} revenue as measured in Dashboard History.`;
}

const METRIC_SHORT_NAMES: Record<string, string> = {
  lcp: "LCP", fcp: "FCP", speedIndex: "Speed Index", tti: "TTI", tbt: "TBT",
  inp: "INP", mainThread: "Main Thread", bootupTime: "Bootup", cls: "CLS",
  unusedJs: "Unused JS", unusedCss: "Unused CSS", ttfb: "TTFB",
};

/**
 * Surgical 3-step blueprint for Pro. Command-style. No Lighthouse references.
 * When resourceLeak is provided, Step 3 includes dollar recovery.
 */
export function getFixBlueprintSteps(
  engineKey: string | null,
  _metricLabel: string,
  resource: ContributingResource,
  _displayValue?: string,
  resourceLeak?: number
): FixBlueprintSteps {
  const t = (resource.type || "").toLowerCase();
  const metricName = engineKey ? (METRIC_SHORT_NAMES[engineKey] ?? engineKey) : "metric";
  const step3 = typeof resourceLeak === "number" && resourceLeak > 0
    ? step3Recover(metricName, resourceLeak)
    : "Verify revenue recovery in Dashboard History.";

  const generic: FixBlueprintSteps = {
    step1: "Identify the dependency causing the bloat.",
    step2: "Apply the appropriate tactical optimization for this resource type.",
    step3,
  };

  if (!engineKey) return generic;

  const stepsByKey: Record<string, FixBlueprintSteps> = {
    lcp: t === "image"
      ? { step1: "Identify the LCP image URL and its script/link tag.", step2: "Add explicit width and height (or aspect-ratio); preload this image in the document head.", step3 }
      : t === "css"
        ? { step1: "Locate the stylesheet blocking the largest content.", step2: "Inline critical CSS for above-the-fold; load non-critical CSS asynchronously.", step3 }
        : t === "font"
          ? { step1: "Identify the font blocking first paint for LCP text.", step2: "Preload this font; set font-display: optional or swap.", step3 }
        : { step1: "Add 'defer' to this specific script tag (or move it below LCP).", step2: "Implement async chunk loading so this script does not block the main content from painting.", step3 },
    fcp: { step1: "Identify which resource blocks first paint (document, CSS, or script).", step2: "Inline critical CSS; defer non-critical JS.", step3 },
    speedIndex: t === "css"
      ? { step1: "Locate render-blocking stylesheets for above-the-fold.", step2: "Inline critical CSS; defer or async-load the rest.", step3 }
      : t === "image"
        ? { step1: "Identify images in the initial viewport.", step2: "Optimize format and size; preload LCP image if applicable.", step3 }
        : { step1: "Add 'defer' to this script tag.", step2: "Implement async chunk loading so the page can paint sooner.", step3 },
    tti: { step1: "Identify the entry point of the heaviest bundles running before interactivity.", step2: "Implement route-based code splitting for this bundle.", step3 },
    tbt: { step1: "Identify which scripts produce long tasks.", step2: "Break up long tasks: requestIdleCallback segmentation or async chunk loading.", step3 },
    inp: { step1: "Identify the input target and scripts on the main thread during interaction.", step2: "Defer scripts and segment long tasks; reduce main thread work during interaction.", step3 },
    mainThread: { step1: "Identify the entry point of this bundle in the main layout.", step2: "Implement route-based code splitting for this bundle.", step3 },
    bootupTime: { step1: "Identify which scripts run at load and contribute to bootup.", step2: "Implement route-based code splitting; tree-shake and lazy-load.", step3 },
    cls: resource.causeType === "image"
      ? { step1: "Identify the image element causing layout shift (no dimensions).", step2: "Set explicit width and height on the img tag or use aspect-ratio in CSS.", step3 }
      : resource.causeType === "font"
        ? { step1: "Identify the font causing layout shift on swap.", step2: "Reserve space (size-adjust or preload) or use font-display: optional.", step3 }
        : { step1: "Identify which element or injection causes the layout shift.", step2: "Reserve space for dynamic content or move below the fold.", step3 },
    unusedJs: { step1: "Identify where this bundle is imported and which routes use it.", step2: "Implement route-based code splitting for this bundle.", step3 },
    unusedCss: { step1: "Identify which pages or components reference this stylesheet.", step2: "Split CSS by route or component; load only what is needed.", step3 },
    ttfb: { step1: "Identify the origin and any proxy/CDN for the main document.", step2: "Improve server response: caching, CDN, DB/index optimization.", step3 },
  };

  const base = stepsByKey[engineKey] ?? generic;
  return { ...base, step3 };
}
