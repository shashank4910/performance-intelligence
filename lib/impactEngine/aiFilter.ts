
/**
 * PROJECT CONTEXT
 *
 * Before modifying this file, read:
 * /docs/AI_CONTEXT.md
 * /docs/ARCHITECTURE.md
 *
 * This project is a Performance Intelligence Engine that converts
 * performance metrics into business impact insights.
 */

/**
 * CORTEX v3 — AI Forensic Filter.
 * Reduces 90+ resources to top 7 surgical culprits per metric.
 * Preserves CORTEX v2 allocation integrity; filter is display-only.
 */

import type { ContributingResource } from "@/lib/metricIntelligenceEngine";

const NEAR_ZERO_LEAK_THRESHOLD = 0.01; // $0.01/mo
const MAX_SURGICAL_CULPRITS = 7;

/** Tracker / analytics URL patterns to exclude from surgical list */
const TRACKER_PATTERNS = [
  /google-analytics|googletagmanager|gtag|analytics\.js|ga\.js/i,
  /facebook\.net|connect\.facebook|fbcdn/i,
  /hotjar|hotjar\.com/i,
  /segment\.io|segment\.com|analytics\.segment/i,
  /mixpanel|mixpanel\.com/i,
  /fullstory|fullstory\.com/i,
  /clarity\.ms|clarity\.com/i,
  /heap\.io|heapanalytics/i,
  /amplitude|amplitude\.com/i,
  /pixel\.|tracking|tracker|beacon/i,
];

function isTracker(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  return TRACKER_PATTERNS.some((p) => p.test(url));
}

/** Passive font: font type but not blocking critical rendering */
function isPassiveNonBlockingFont(resource: ContributingResource): boolean {
  const t = (resource.type || "").toLowerCase();
  if (t !== "font") return false;
  if (resource.isRenderBlocking === true) return false;
  return true;
}

/** Normalize URL to a stable key for deduplication (path + query stripped to path) */
function urlStem(url: string): string {
  try {
    const u = new URL(url, "https://_");
    const path = u.pathname.replace(/\/$/, "") || "/";
    return path.toLowerCase();
  } catch {
    return url.slice(0, 80).toLowerCase();
  }
}

export type SurgicalCulpritsInput = {
  resources: ContributingResource[];
  metricName: string;
  /** Revenue leak per resource (aligned with resources). */
  attributedLeaks: number[];
};

export type SurgicalCulpritsResult = {
  resources: ContributingResource[];
  /** Original indices of returned resources (for debugging). */
  originalIndices: number[];
};

/**
 * Reduce to top 7 surgical culprits per metric.
 * Removes: trackers, passive non-blocking fonts, $0/near-zero leak, duplicate minor deps.
 * Ranks by: revenue impact, blocking severity, execution delay, critical path.
 */
export function getSurgicalCulprits(input: SurgicalCulpritsInput): SurgicalCulpritsResult {
  const { resources, metricName, attributedLeaks } = input;
  if (!resources?.length) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      console.log("--- CORTEX v3 FILTER ---\nMetric:", metricName, "\nOriginal: 0\nClean: 0");
    }
    return { resources: [], originalIndices: [] };
  }

  const withIndex = resources.map((r, i) => ({
    resource: r,
    index: i,
    leak: typeof attributedLeaks[i] === "number" && Number.isFinite(attributedLeaks[i]) ? attributedLeaks[i] : 0,
  }));

  // 1. Remove: trackers, passive fonts not blocking, $0/near-zero, duplicate minor deps
  const filtered = withIndex.filter(({ resource, leak }) => {
    if (resource.url && isTracker(resource.url)) return false;
    if (isPassiveNonBlockingFont(resource)) return false;
    if (leak < NEAR_ZERO_LEAK_THRESHOLD) return false;
    return true;
  });

  // Dedupe by url stem (keep first = often the one with higher impact after sort)
  const seenStems = new Set<string>();
  const deduped = filtered.filter(({ resource }) => {
    const stem = urlStem(resource.url || "");
    if (seenStems.has(stem)) return false;
    seenStems.add(stem);
    return true;
  });

  // 2. Rank by: revenue impact (primary), blocking severity, execution delay, critical path
  const urgencyWeight: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  const sorted = [...deduped].sort((a, b) => {
    const leakA = a.leak;
    const leakB = b.leak;
    if (leakB !== leakA) return leakB - leakA;

    const blockA = (a.resource.isRenderBlocking === true ? 2 : 0) + (urgencyWeight[a.resource.urgencyLevel] ?? 0);
    const blockB = (b.resource.isRenderBlocking === true ? 2 : 0) + (urgencyWeight[b.resource.urgencyLevel] ?? 0);
    if (blockB !== blockA) return blockB - blockA;

    const execA = a.resource.executionTimeMs ?? 0;
    const execB = b.resource.executionTimeMs ?? 0;
    if (execB !== execA) return execB - execA;

    const pathA = a.resource.isBeforeMetricTime === true ? 1 : 0;
    const pathB = b.resource.isBeforeMetricTime === true ? 1 : 0;
    return pathB - pathA;
  });

  const top = sorted.slice(0, MAX_SURGICAL_CULPRITS);
  const result: SurgicalCulpritsResult = {
    resources: top.map((x) => x.resource),
    originalIndices: top.map((x) => x.index),
  };

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    console.log("--- CORTEX v3 FILTER ---\nMetric:", metricName, "\nOriginal:", resources.length, "\nClean:", result.resources.length);
  }

  return result;
}
