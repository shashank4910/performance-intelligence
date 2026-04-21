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



"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { analyzeMetric, type MetricKey, type ContributingResource } from "@/lib/metricIntelligenceEngine";
import { generateMetricAIExplanation } from "@/lib/metricAIExplanation";
import {
  attributeLeakToResources,
  getTopFiveUnderperformers,
  distributeLeakBySeverity,
  type ResourceForAttribution,
  type MetricValuesForPriority,
} from "@/lib/impactEngine/revenueLeakCalculator";
import { getImpactNarrativeFallback } from "@/lib/impactEngine/cortexNarrative";
import type { CortexStage } from "@/lib/impactEngine/cortexV2";
import ProUpgradeModal from "@/components/ProUpgradeModal";
import UpgradeModal from "@/components/UpgradeModal";
import MetricAuditTabs, { type AuditTabId } from "@/components/MetricAuditTabs";
import { getGenericCategoryForResource } from "@/lib/metricDrawerMonetization";
import { resolveLeakForMetricDrawer } from "@/lib/headlineRevenueLeak";

/** Map metric key to CORTEX v2 stage for narrative generation. */
function engineKeyToCortexStage(engineKey: string | null): CortexStage {
  if (!engineKey) return "VISUAL_ENTRY";
  const visual: CortexStage = "VISUAL_ENTRY";
  const interaction: CortexStage = "INTERACTION";
  const trust: CortexStage = "TRUST";
  const infra: CortexStage = "INFRASTRUCTURE";
  const map: Record<string, CortexStage> = {
    lcp: visual,
    fcp: visual,
    speedIndex: visual,
    tti: interaction,
    tbt: interaction,
    inp: interaction,
    mainThread: interaction,
    bootupTime: interaction,
    longTasks: interaction,
    cls: trust,
    unusedJs: infra,
    unusedCss: infra,
    ttfb: interaction,
  };
  return map[engineKey] ?? visual;
}

const METRIC_LABELS: Record<string, string> = {
  "largest-contentful-paint": "Largest Contentful Paint (LCP)",
  "cumulative-layout-shift": "Cumulative Layout Shift (CLS)",
  "interaction-to-next-paint": "Interaction to Next Paint (INP)",
  "first-contentful-paint": "First Contentful Paint (FCP)",
  "speed-index": "Speed Index",
  "interactive": "Time to Interactive (TTI)",
  "total-blocking-time": "Total Blocking Time (TBT)",
  "mainthread-work-breakdown": "Main Thread Work",
  "long-tasks": "Long Tasks",
  "bootup-time": "Bootup Time",
  "server-response-time": "Server Response Time (TTFB)",
  "total-byte-weight": "Total Page Size",
  "unused-javascript": "Unused JavaScript",
  "unused-css-rules": "Unused CSS",
  "network-requests": "Network Requests",
};

const TIME_METRIC_IDS = new Set([
  "largest-contentful-paint",
  "first-contentful-paint",
  "interactive",
  "total-blocking-time",
  "bootup-time",
  "speed-index",
  "mainthread-work-breakdown",
  "long-tasks",
]);

function formatMetricValue(id: string, numericValue: number | undefined | null): string | null {
  if (numericValue == null || Number.isNaN(numericValue)) return null;
  if (id === "server-response-time") {
    return (numericValue / 1000).toFixed(2) + " s";
  }
  if (TIME_METRIC_IDS.has(id)) {
    const seconds = numericValue / 1000;
    return seconds.toFixed(1) + " s";
  }
  if (id === "cumulative-layout-shift") {
    return numericValue.toFixed(3);
  }
  if (id === "total-byte-weight") {
    const kb = numericValue / 1024;
    return kb.toFixed(1) + " KB";
  }
  if (id === "unused-javascript" || id === "unused-css-rules") {
    const kb = numericValue / 1024;
    return kb.toFixed(1) + " KB";
  }
  if (id === "network-requests") {
    return String(Math.round(numericValue));
  }
  return String(numericValue);
}

type AuditLike = {
  id?: string;
  title?: string;
  description?: string;
  displayValue?: string;
  numericValue?: number;
  score?: number | null;
} | null | undefined;

type SectionMetrics = Record<string, AuditLike>;

type DetailedMetricsData = {
  core?: SectionMetrics;
  load?: SectionMetrics;
  blocking?: SectionMetrics;
  backend?: SectionMetrics;
} | null | undefined;

export type OffendingResource = {
  url: string | null;
  totalBytes: number;
  wastedBytes: number;
  element: string | null;
};

export type MetricForDashboard = {
  metricKey: string;
  label: string;
  displayValue: string;
  verdict: "Good" | "Needs Improvement" | "Poor";
  aiAnalysis?: {
    rootCause: string;
    fixes: string[];
    impact: string;
    difficulty: string;
  };
  resources?: OffendingResource[];
};

const SECTION_METRIC_IDS: Record<string, { key: string; id: string }[]> = {
  core: [
    { key: "lcp", id: "largest-contentful-paint" },
    { key: "cls", id: "cumulative-layout-shift" },
    { key: "inp", id: "interaction-to-next-paint" },
    { key: "fcp", id: "first-contentful-paint" },
  ],
  load: [
    { key: "speedIndex", id: "speed-index" },
    { key: "tti", id: "interactive" },
    { key: "ttfb", id: "server-response-time" },
  ],
  blocking: [
    { key: "tbt", id: "total-blocking-time" },
    { key: "mainThread", id: "mainthread-work-breakdown" },
    { key: "longTasks", id: "long-tasks" },
    { key: "bootupTime", id: "bootup-time" },
  ],
  backend: [
    { key: "totalBytes", id: "total-byte-weight" },
    { key: "unusedJs", id: "unused-javascript" },
    { key: "unusedCss", id: "unused-css-rules" },
    { key: "networkRequests", id: "network-requests" },
  ],
};

function scoreBadgeClass(score: number | null | undefined): string {
  if (score == null) return "bg-gray-500/20 text-gray-400 px-3 py-1 rounded-full text-xs font-medium";
  if (score >= 0.9) return "bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-medium";
  if (score >= 0.5) return "bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-xs font-medium";
  return "bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-medium";
}

function MetricRow({
  label,
  displayValue,
  score,
}: {
  label: string;
  displayValue: string;
  score: number | null | undefined;
}) {
  return (
    <div className="grid grid-cols-3 items-center gap-4 px-4 py-3.5 transition hover:bg-white/[0.02]">
      <div className="font-medium text-[var(--foreground)]">{label}</div>
      <div className="text-sm tabular-nums text-[var(--foreground)]">{displayValue}</div>
      <div className="flex justify-end">
        <span className={scoreBadgeClass(score)}>
          {score != null ? (score >= 0.9 ? "Good" : score >= 0.5 ? "Needs Improvement" : "Poor") : "—"}
        </span>
      </div>
    </div>
  );
}

const SECTIONS: { id: string; title: string }[] = [
  { id: "core", title: "Core Web Vitals" },
  { id: "load", title: "Load Experience" },
  { id: "blocking", title: "Blocking & Responsiveness" },
  { id: "backend", title: "Backend & Payload" },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function truncateUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.split("/").pop() || u.pathname;
    return path.length > 48 ? path.slice(0, 45) + "..." : path;
  } catch {
    return raw.length > 48 ? raw.slice(0, 45) + "..." : raw;
  }
}

function resourceTypeBadge(url: string): { label: string; cls: string } | null {
  const lower = url.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|svg|ico)/.test(lower))
    return { label: "Image", cls: "bg-purple-500/20 text-purple-400" };
  if (/\.js(\?|$)/.test(lower))
    return { label: "JavaScript", cls: "bg-yellow-500/20 text-yellow-400" };
  if (/\.css(\?|$)/.test(lower))
    return { label: "CSS", cls: "bg-blue-500/20 text-blue-400" };
  if (/\.(woff2?|ttf|otf|eot)/.test(lower))
    return { label: "Font", cls: "bg-pink-500/20 text-pink-400" };
  if (/(google-analytics|googletagmanager|gtag|facebook|hotjar|segment|mixpanel)/.test(lower))
    return { label: "Third-party", cls: "bg-orange-500/20 text-orange-400" };
  return null;
}

/** Generic label for free tier: hide exact filenames, show type-based label only. */
function getGenericResourceLabel(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "js" || t === "javascript") return "JavaScript bundle";
  if (t === "font") return "Font asset";
  if (t === "image") return "Image asset";
  if (t === "css") return "Stylesheet";
  if (t === "document") return "Page document";
  return "Other resource";
}

/** True if URL matches known third-party patterns (analytics, tag managers, etc.). */
function isThirdPartyUrl(url: string): boolean {
  if (!url || url.startsWith("<")) return false;
  const lower = url.toLowerCase();
  return /(google-analytics|googletagmanager|gtag|facebook|hotjar|segment|mixpanel|analytics|tracking)/.test(lower);
}

/** True if resource is third-party: by resource URL and/or initiator URL (first vs third party for grouping). */
function isThirdPartyResource(resource: ContributingResource): boolean {
  if (isThirdPartyUrl(resource.url || "")) return true;
  const initiator = resource.initiator ?? "";
  if (typeof initiator === "string" && initiator.length > 0 && isThirdPartyUrl(initiator)) return true;
  return false;
}

/** Diagnostic category label for grouping (exact spec: plural form for group display). */
function getResourceCategoryLabel(resource: ContributingResource): string {
  const t = (resource.type || "").toLowerCase();
  const thirdParty = isThirdPartyResource(resource);
  if (t === "js" || t === "javascript") return thirdParty ? "Third-party scripts" : "JavaScript execution bundles";
  if (t === "font") return "Web fonts blocking render";
  if (t === "image") return "Large image assets";
  if (t === "css") return "Render blocking stylesheets";
  if (t === "document") return "Page document";
  return "Other resources";
}

/** Category key for grouping: resource.type + first/third party (from URL and initiator). */
function getCategoryKeyForGrouping(resource: ContributingResource): string {
  const t = (resource.type || "").toLowerCase();
  const thirdParty = isThirdPartyResource(resource);
  if (t === "js" || t === "javascript") return thirdParty ? "js-third" : "js-first";
  if (t === "font") return "font";
  if (t === "image") return "image";
  if (t === "css") return "css";
  if (t === "document") return "document";
  return "other";
}

const URGENCY_WEIGHT: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

type ResourceGroup = { label: string; count: number; impact: number };

/** Group resources by category for free tier (by resource.type and third-party/initiator). Returns { label, count, impact } sorted by count desc then impact desc. */
function groupResourcesForFreeTier(resources: ContributingResource[]): ResourceGroup[] {
  const byKey = new Map<string, { label: string; count: number; impact: number }>();
  for (const res of resources) {
    const key = getCategoryKeyForGrouping(res);
    const label = getResourceCategoryLabel(res);
    const impactVal = URGENCY_WEIGHT[res.urgencyLevel] ?? 1;
    if (byKey.has(key)) {
      const g = byKey.get(key)!;
      g.count += 1;
      g.impact = Math.max(g.impact, impactVal);
    } else {
      byKey.set(key, { label, count: 1, impact: impactVal });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || b.impact - a.impact);
}

/** Short explanation for confidence (why High/Medium/Low). */
function getConfidenceExplanation(attributedAmounts: number[], leakForMetric: number): string {
  if (leakForMetric <= 0 || attributedAmounts.length === 0) return "";
  const weights = attributedAmounts.map((a) => a / leakForMetric);
  const sorted = [...weights].sort((a, b) => b - a);
  const topOne = sorted[0] ?? 0;
  const topThree = (sorted[0] ?? 0) + (sorted[1] ?? 0) + (sorted[2] ?? 0);
  if (topOne > 0.6) return "one dominant resource causes most of the delay";
  if (topThree > 0.6 && attributedAmounts.length <= 5) return "a few resources drive most of the delay";
  return "multiple resources contribute to this delay";
}

/** Fallback: build contributing resources from rawAudit when intelligence/API return none. */
function getResourcesFromRawAudit(
  rawAudit: Record<string, unknown> | null | undefined,
  metricLabel: string
): ContributingResource[] {
  const audits = rawAudit?.audits as Record<string, { details?: { items?: unknown[] } }> | undefined;
  if (!audits || typeof audits !== "object") return [];
  type Item = { url?: string; source?: string; request?: { url?: string }; transferSize?: number; totalBytes?: number };
  const toItem = (i: unknown): Item => (i as Item);
  const getUrl = (i: Item): string => i?.url || i?.source || i?.request?.url || "";
  const getSize = (i: Item): number => i?.transferSize ?? i?.totalBytes ?? 0;
  const auditIdsToTry = [
    "network-requests",
    "render-blocking-resources",
    "largest-contentful-paint-element",
    "layout-shift-elements",
    "unused-javascript",
    "unused-css-rules",
  ];
  let items: Item[] = [];
  for (const id of auditIdsToTry) {
    const det = audits[id]?.details?.items;
    if (Array.isArray(det) && det.length > 0) {
      items = det.map(toItem).filter((i) => getUrl(i));
      if (items.length > 0) break;
    }
  }
  if (items.length === 0) {
    for (const key of Object.keys(audits)) {
      const det = audits[key]?.details?.items;
      if (Array.isArray(det) && det.length > 0) {
        const withUrl = det.map(toItem).filter((i) => getUrl(i));
        if (withUrl.length > 0) {
          items = withUrl;
          break;
        }
      }
    }
  }
  return items.slice(0, 15).map((i, idx) => {
    const url = getUrl(i);
    const label = resourceTypeBadge(url)?.label.toLowerCase() ?? "other";
    const len = items.length;
    let urgencyLevel: "High" | "Medium" | "Low" = "Medium";
    if (len > 0) {
      if (idx < len / 3) urgencyLevel = "High";
      else if (idx >= (2 * len) / 3) urgencyLevel = "Low";
    }
    return {
      url,
      type: label,
      urgencyLevel,
      transferSize: getSize(i),
      reason: "Affected resource",
      affects: metricLabel,
    };
  });
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

const ENGINE_METRIC_KEYS: Record<string, MetricKey> = {
  lcp: "lcp",
  tti: "tti",
  cls: "cls",
  ttfb: "ttfb",
  tbt: "tbt",
  speedIndex: "speedIndex",
  mainThread: "mainThread",
  bootupTime: "bootupTime",
  unusedJs: "unusedJs",
  unusedCss: "unusedCss",
};

function metricKeyToEngineKey(metricKey: string): MetricKey | null {
  const suffix = metricKey.split("-").slice(1).join("-");
  return ENGINE_METRIC_KEYS[suffix] ?? null;
}

/** Format execution time for recommendation copy. */
function formatExecMs(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 1) return "";
  if (ms >= 1000) return `~${(ms / 1000).toFixed(1)} s`;
  return `~${Math.round(ms)} ms`;
}

/** Format transfer size for recommendation copy. */
function formatSizeForRec(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 1) return "";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Extract filename from URL for contextual recommendations. */
function getFilenameFromUrl(url: string): string {
  if (!url || url.startsWith("<")) return "this resource";
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split("/").filter(Boolean).pop() || pathname;
    return segment.length > 48 ? segment.slice(0, 45) + "…" : segment;
  } catch {
    return url.length > 48 ? url.slice(0, 45) + "…" : url;
  }
}

/**
 * Deduplicate resources by resource.url. Merge transferSize, executionTimeMs, attributedLeak (sum).
 * Add requestCount for merged entries. Returns deduped resources and aligned attributed amounts.
 */
function deduplicateResourcesByUrl(
  resources: ContributingResource[],
  attributedAmounts: number[]
): { resources: ContributingResource[]; attributedAmounts: number[] } {
  if (resources.length === 0) return { resources: [], attributedAmounts: [] };
  const byUrl = new Map<string, { resource: ContributingResource; leakSum: number; count: number }>();
  resources.forEach((res, i) => {
    const key = res.url || `__empty_${i}`;
    const leak = attributedAmounts[i] ?? 0;
    if (byUrl.has(key)) {
      const existing = byUrl.get(key)!;
      existing.resource.transferSize = (existing.resource.transferSize ?? 0) + (res.transferSize ?? 0);
      existing.resource.executionTimeMs = (existing.resource.executionTimeMs ?? 0) + (res.executionTimeMs ?? 0);
      existing.leakSum += leak;
      existing.count += 1;
    } else {
      byUrl.set(key, {
        resource: {
          ...res,
          transferSize: res.transferSize ?? 0,
          executionTimeMs: res.executionTimeMs ?? 0,
          requestCount: 1,
        },
        leakSum: leak,
        count: 1,
      });
    }
  });
  const outResources: ContributingResource[] = [];
  const outAmounts: number[] = [];
  byUrl.forEach(({ resource, leakSum, count }) => {
    outResources.push({ ...resource, requestCount: count > 1 ? count : undefined });
    outAmounts.push(leakSum);
  });
  return { resources: outResources, attributedAmounts: outAmounts };
}

/** 500 KB in bytes. */
const SIZE_500_KB = 500 * 1024;
/** 1 MB in bytes. */
const SIZE_1_MB = 1_048_576;

/**
 * Context-aware, resource-type-specific recommendations.
 * Uses resource.url (filename), transferSize, executionTimeMs, affects, type.
 * Scripts: execution severity (>500ms vs <100ms) and size thresholds (>500KB, >1MB) drive fix suggestions.
 */
function getMetricResourceRecommendation(
  metricLabel: string,
  resource: ContributingResource
): { action: string; why: string; technicalDetails: string[] } {
  const t = (resource.type || "").toLowerCase();
  const execMs = resource.executionTimeMs ?? 0;
  const size = resource.transferSize ?? 0;
  const execStr = formatExecMs(execMs);
  const sizeStr = formatSizeForRec(size);
  const affects = resource.affects ?? metricLabel;
  const filename = getFilenameFromUrl(resource.url || "");
  const resourceName = filename && filename !== "this resource" ? filename : (t === "js" || t === "javascript" ? "This script" : t === "image" ? "This image" : t === "css" ? "This stylesheet" : t === "font" ? "This font" : "This resource");

  // --- Behavioral "why" text (avoid generic "users may leave") ---
  const whyByMetric: Record<string, string> = {
    "Largest Contentful Paint (LCP)": "The main content image drives first impression; delays cause perceived slowness before users engage.",
    "Time to Interactive (TTI)": "This delay causes interaction paralysis — users attempt to click or scroll before the page is ready.",
    "Total Blocking Time (TBT)": "Blocking time creates a frozen feel; clicks and taps are ignored until the main thread frees up.",
    "Main Thread Work": "Heavy main-thread work delays interactivity; users assume the page is broken when actions don’t respond.",
    "Speed Index": "Slow visual population makes the page feel empty; users question whether content is loading.",
    "Cumulative Layout Shift (CLS)": "Layout shifts cause accidental clicks and damage trust; elements move under the cursor.",
    "Unused JavaScript": "Unused code increases load and parse cost without benefit, delaying when the page becomes usable.",
    "Bootup Time": "Script bootup delays when the page becomes responsive; users hit buttons before handlers are attached.",
    "Server Response Time (TTFB)": "A slow first byte delays everything that follows — paint, interactivity, and perceived speed.",
  };
  const defaultWhy = `Addressing this improves ${affects} and reduces friction.`;

  // --- IMAGE: compress, next-gen format, responsive sizes ---
  if (t === "image") {
    const sizeCtx = sizeStr ? ` (${sizeStr})` : "";
    if (metricLabel.includes("LCP") || metricLabel.includes("Largest Contentful")) {
      return {
        action: `${resourceName}${sizeCtx} drives the largest contentful paint. Prioritize loading and reserve space to avoid layout shift. Recommended: explicit width/height or aspect-ratio; preload if critical.`,
        why: whyByMetric["Largest Contentful Paint (LCP)"] ?? defaultWhy,
        technicalDetails: ["Compress image and serve next-gen format (WebP/AVIF).", "Use responsive sizes (srcset) to avoid overfetch.", "Add width/height to img or aspect-ratio in CSS; preload LCP image."],
      };
    }
    if (metricLabel.includes("Speed Index")) {
      return {
        action: `${resourceName}${sizeCtx} slows how quickly the visible area paints. Optimize format and size; preload if it’s the LCP candidate.`,
        why: whyByMetric["Speed Index"] ?? defaultWhy,
        technicalDetails: ["Compress and serve next-gen format (WebP/AVIF).", "Use responsive sizes (srcset).", "Preload above-the-fold images if LCP."],
      };
    }
    if (metricLabel.includes("CLS") || metricLabel.includes("Layout Shift")) {
      return {
        action: `Reserve space for ${resourceName} so layout does not jump when it loads.`,
        why: whyByMetric["Cumulative Layout Shift (CLS)"] ?? defaultWhy,
        technicalDetails: ["Set width and height on img.", "Use aspect-ratio in CSS.", "Preload to reduce layout shift timing."],
      };
    }
    return {
      action: `Optimize ${resourceName}${sizeCtx}: compress, serve next-gen format, and use responsive sizes.`,
      why: defaultWhy,
      technicalDetails: ["Compress image; serve WebP/AVIF.", "Use srcset for responsive sizes.", "Add dimensions to prevent CLS."],
    };
  }

  // --- FONT: font-display swap, preload critical ---
  if (t === "font") {
    if (metricLabel.includes("LCP") || metricLabel.includes("Largest Contentful")) {
      return {
        action: `${resourceName} blocks rendering until it loads. Load without blocking paint or use a system font for above-the-fold text.`,
        why: whyByMetric["Largest Contentful Paint (LCP)"] ?? defaultWhy,
        technicalDetails: ["Use font-display: swap or optional.", "Preload critical font in document head.", "Consider size-adjust to reduce layout shift."],
      };
    }
    if (metricLabel.includes("Speed Index")) {
      return {
        action: `Load ${resourceName} without blocking first paint so the page can fill visually sooner.`,
        why: whyByMetric["Speed Index"] ?? defaultWhy,
        technicalDetails: ["Use font-display: swap or optional.", "Preload key fonts.", "Subset fonts to reduce size."],
      };
    }
    if (metricLabel.includes("CLS") || metricLabel.includes("Layout Shift")) {
      return {
        action: `${resourceName} swap changes text size and shifts layout. Reduce impact with size-adjust or reserve space.`,
        why: whyByMetric["Cumulative Layout Shift (CLS)"] ?? defaultWhy,
        technicalDetails: ["Use font-size-adjust or similar.", "Preload fonts to reduce swap delay.", "Reserve space for text where possible."],
      };
    }
    return {
      action: `Load ${resourceName} without blocking paint; use font-display and preload for critical fonts.`,
      why: defaultWhy,
      technicalDetails: ["font-display: swap or optional.", "Preload critical font.", "Subset to reduce transfer size."],
    };
  }

  // --- SCRIPT: execution severity (>500ms vs <100ms) and size thresholds (>500KB, >1MB) ---
  if (t === "js" || t === "javascript") {
    const execCtx = execStr ? ` runs for ${execStr} on the main thread` : "";
    const sizeCtx = sizeStr ? ` (${sizeStr})` : "";
    const heavyExec = execMs > 500;
    const lightExec = execMs > 0 && execMs < 100;
    const over500K = size > SIZE_500_KB;
    const over1M = size > SIZE_1_MB;
    const scriptDetails = (): string[] => {
      if (heavyExec) return ["Split bundle with dynamic import().", "Use route-based or feature-based code splitting.", "Consider web workers for CPU-heavy work."];
      if (lightExec) return ["Use defer or async on the script tag.", "Load after first paint if non-critical."];
      if (over1M) return ["Aggressive code splitting or lazy loading.", "Split by route or feature; load on interaction.", "Tree-shake and remove unused code."];
      if (over500K) return ["Bundle splitting: split this script into smaller chunks.", "Use dynamic import() for below-the-fold or on interaction."];
      return ["Dynamic import() for non-critical code.", "Route-based code splitting.", "Lazy-load widget or feature."];
    };
    if (metricLabel.includes("TTI") || metricLabel.includes("Time to Interactive")) {
      return {
        action: `${resourceName}${execCtx} and delays interactivity. It runs before the page is ready for input. Load it after first interaction or split using dynamic import().`,
        why: whyByMetric["Time to Interactive (TTI)"] ?? defaultWhy,
        technicalDetails: scriptDetails(),
      };
    }
    if (metricLabel.includes("TBT") || metricLabel.includes("Blocking Time")) {
      return {
        action: `${resourceName}${execCtx} and blocks the main thread. Reduce blocking: break up long tasks or defer.`,
        why: whyByMetric["Total Blocking Time (TBT)"] ?? defaultWhy,
        technicalDetails: scriptDetails(),
      };
    }
    if (metricLabel.includes("Main Thread")) {
      return {
        action: `${resourceName}${execCtx}${sizeCtx} delays when the page feels ready. Reduce evaluation and parse time.`,
        why: whyByMetric["Main Thread Work"] ?? defaultWhy,
        technicalDetails: scriptDetails(),
      };
    }
    if (metricLabel.includes("Speed Index")) {
      return {
        action: `Defer ${resourceName} until after first paint so the page can show content sooner${execCtx ? `; it currently runs for ${execStr}` : ""}.`,
        why: whyByMetric["Speed Index"] ?? defaultWhy,
        technicalDetails: scriptDetails(),
      };
    }
    if (metricLabel.includes("LCP") || metricLabel.includes("Largest Contentful")) {
      return {
        action: `${resourceName} runs before the page becomes visible and delays LCP. Load it after first paint or split it using dynamic import().`,
        why: whyByMetric["Largest Contentful Paint (LCP)"] ?? defaultWhy,
        technicalDetails: scriptDetails(),
      };
    }
    if (metricLabel.includes("Unused")) {
      return {
        action: `Remove or code-split ${resourceName}${sizeCtx} so only needed code loads.`,
        why: whyByMetric["Unused JavaScript"] ?? defaultWhy,
        technicalDetails: ["Tree-shake and run bundle analyzer.", "Code-split by route or feature.", "Lazy-load unused chunks."],
      };
    }
    if (metricLabel.includes("Bootup")) {
      return {
        action: `Reduce how much of ${resourceName} runs at load: code-split, lazy-load, or remove unused code${execCtx ? ` (currently ${execStr})` : ""}.`,
        why: whyByMetric["Bootup Time"] ?? defaultWhy,
        technicalDetails: scriptDetails(),
      };
    }
    return {
      action: `${resourceName}${execCtx}${sizeCtx} affects ${affects}. It runs on the main thread before the page is ready. Split with dynamic import() or load after first interaction.`,
      why: defaultWhy,
      technicalDetails: scriptDetails(),
    };
  }

  // --- CSS: inline critical, defer non-critical ---
  if (t === "css") {
    const sizeCtx = sizeStr ? ` (${sizeStr})` : "";
    if (metricLabel.includes("LCP") || metricLabel.includes("Largest Contentful")) {
      return {
        action: `${resourceName}${sizeCtx} blocks the largest content from painting. Defer or inline critical CSS so this file does not block.`,
        why: whyByMetric["Largest Contentful Paint (LCP)"] ?? defaultWhy,
        technicalDetails: ["Inline critical above-the-fold CSS.", "Load non-critical CSS with media=\"print\" then swap to all.", "Defer or async load this file."],
      };
    }
    if (metricLabel.includes("Speed Index")) {
      return {
        action: `Remove render-blocking or inline critical ${resourceName} so the page can paint faster${sizeCtx}.`,
        why: whyByMetric["Speed Index"] ?? defaultWhy,
        technicalDetails: ["Inline critical CSS for above-the-fold.", "Defer non-critical styles.", "Use media=\"print\" trick and swap."],
      };
    }
    return {
      action: `${resourceName}${sizeCtx} blocks rendering. Inline critical styles and defer the rest.`,
      why: defaultWhy,
      technicalDetails: ["Inline critical CSS.", "Defer non-critical styles (async or media swap).", "Reduce unused CSS."],
    };
  }

  // --- SERVER / DOCUMENT: CDN, caching, database ---
  if (t === "document" || t === "other") {
    if (metricLabel.includes("TTFB")) {
      return {
        action: `Improve server response for ${resourceName}: faster server, CDN, or caching so the first byte arrives sooner.`,
        why: whyByMetric["Server Response Time (TTFB)"] ?? defaultWhy,
        technicalDetails: ["Use a CDN for static assets and edge caching.", "Enable HTTP caching (Cache-Control, ETag).", "Optimize database queries and server-side rendering."],
      };
    }
  }

  if (metricLabel.includes("TTFB")) {
    return {
      action: "Improve server response time (faster server, CDN, or caching) so the first byte and all dependent resources load sooner.",
      why: whyByMetric["Server Response Time (TTFB)"] ?? defaultWhy,
      technicalDetails: ["Use a CDN.", "Enable caching (Cache-Control, ETag).", "Optimize database and server logic."],
    };
  }

  if (metricLabel.includes("CLS") || metricLabel.includes("Layout Shift")) {
    if (resource.causeType === "script-injection") {
      return {
        action: "Insert content below existing content or reserve space to avoid pushing layout down.",
        why: whyByMetric["Cumulative Layout Shift (CLS)"] ?? defaultWhy,
        technicalDetails: ["Reserve space for ads or widgets.", "Load below the fold or after layout stable."],
      };
    }
    return {
      action: "Reserve space for this element so layout stays stable as it loads.",
      why: whyByMetric["Cumulative Layout Shift (CLS)"] ?? defaultWhy,
      technicalDetails: ["Set dimensions or aspect-ratio.", "Avoid inserting above existing content."],
    };
  }

  return {
    action: `Optimize this resource for ${affects}.`,
    why: defaultWhy,
    technicalDetails: ["Review load order and size.", "Defer or optimize as appropriate for type."],
  };
}

const STRATEGIC_CONTEXT: Record<string, string> = {
  "Largest Contentful Paint (LCP)": "Visual population delay",
  "Time to Interactive (TTI)": "Interaction delay",
  "Total Blocking Time (TBT)": "Interaction delay",
  "Main Thread Work": "Interaction delay",
  "Speed Index": "Visual population delay",
  "Cumulative Layout Shift (CLS)": "Layout disruption",
  "Unused JavaScript": "Excess unused code",
  "Bootup Time": "Interaction delay",
  "Server Response Time (TTFB)": "Backend delay",
};

/**
 * Normalized priority score 0–100.
 * normalizedLeak = leak / maxLeak, normalizedExec = execMs / maxExec, normalizedSize = size / maxSize.
 * priorityScore = 0.5*normLeak + 0.3*normExec + 0.2*normSize, then scale to 0–100.
 */
function computePriorityScores(
  resources: ContributingResource[],
  attributedAmounts: number[]
): number[] {
  if (resources.length === 0) return [];
  const leaks = attributedAmounts.map((a) => a ?? 0);
  const execs = resources.map((r) => r.executionTimeMs ?? 0);
  const sizes = resources.map((r) => r.transferSize ?? 0);
  const maxLeak = Math.max(...leaks, 1);
  const maxExec = Math.max(...execs, 1);
  const maxSize = Math.max(...sizes, 1);
  return resources.map((res, i) => {
    const normalizedLeak = leaks[i] / maxLeak;
    const normalizedExec = execs[i] / maxExec;
    const normalizedSize = sizes[i] / maxSize;
    const score = 0.5 * normalizedLeak + 0.3 * normalizedExec + 0.2 * normalizedSize;
    return Math.min(100, Math.round(score * 100));
  });
}

/** Get Lighthouse audit id for a dashboard metricKey (e.g. "core-lcp" -> "largest-contentful-paint"). */
function getAuditIdFromMetricKey(metricKey: string): string | null {
  const parts = metricKey.split("-");
  if (parts.length < 2) return null;
  const section = parts[0];
  const key = parts.slice(1).join("-");
  return SECTION_METRIC_IDS[section]?.find((m) => m.key === key)?.id ?? null;
}

/**
 * Composite confidence: attributionWeight (0.5) + metricSeverity (0.3) + resourceConcentration (0.2).
 * confidenceScore > 0.7 → High, > 0.4 → Medium, else Low.
 */
function getConfidenceForResource(
  resourceLeak: number,
  totalLeakForMetric: number,
  metricSeverity: number,
  numberOfResources: number
): "High" | "Medium" | "Low" {
  const attributionWeight = totalLeakForMetric > 0 ? resourceLeak / totalLeakForMetric : 0;
  const resourceConcentration = numberOfResources > 0 ? 1 / numberOfResources : 0;
  const confidenceScore =
    0.5 * attributionWeight + 0.3 * Math.min(1, metricSeverity) + 0.2 * resourceConcentration;
  if (confidenceScore > 0.7) return "High";
  if (confidenceScore > 0.4) return "Medium";
  return "Low";
}

const AUDIT_ID_TO_METRIC_KEY: Record<string, keyof MetricValuesForPriority> = {
  "largest-contentful-paint": "lcp",
  interactive: "tti",
  "first-contentful-paint": "fcp",
  "speed-index": "speedIndex",
  "total-blocking-time": "tbt",
  "mainthread-work-breakdown": "mainThread",
  "bootup-time": "bootupTime",
  "unused-javascript": "unusedJs",
  "unused-css-rules": "unusedCss",
};

function buildMetricsFromAudit(rawAudit: Record<string, unknown> | null | undefined): MetricValuesForPriority {
  const audits = rawAudit?.audits as Record<string, { numericValue?: number }> | undefined;
  if (!audits || typeof audits !== "object") return {};
  const m: MetricValuesForPriority = {};
  for (const [auditId, key] of Object.entries(AUDIT_ID_TO_METRIC_KEY)) {
    const v = audits[auditId]?.numericValue;
    if (typeof v === "number" && Number.isFinite(v)) m[key] = v;
  }
  return m;
}

function getLeakLabel(engineKey: string | null): string {
  if (!engineKey) return "Revenue Leak";
  const labels: Record<string, string> = {
    lcp: "Revenue Leak (LCP)",
    tti: "Interaction Leak (TTI)",
    fcp: "First Paint Leak (FCP)",
    speedIndex: "Speed Index Leak",
    tbt: "Responsiveness Leak (TBT)",
    mainThread: "Main Thread Leak",
    bootupTime: "Bootup Leak",
    unusedJs: "Unused Assets Leak",
    unusedCss: "Payload Friction (Unused CSS)",
    cls: "Layout Stability Leak (CLS)",
    ttfb: "Backend Leak (TTFB)",
  };
  return labels[engineKey] ?? "Revenue Leak";
}

/** Metric short name for explainer (e.g. "LCP", "TTI"). */
function getMetricShortName(engineKey: string | null): string {
  if (!engineKey) return "load time";
  const names: Record<string, string> = {
    lcp: "LCP",
    tti: "TTI",
    fcp: "FCP",
    speedIndex: "Speed Index",
    tbt: "TBT",
    mainThread: "Main Thread",
    bootupTime: "Bootup Time",
    unusedJs: "Unused JavaScript",
    unusedCss: "Unused CSS",
    cls: "CLS",
    ttfb: "TTFB",
    inp: "INP",
  };
  return names[engineKey] ?? "metric";
}

/** FREE tab: metric impact phrase (e.g. "Affects LCP by 1.2 s", "Adds 320 ms TBT"). */
function getMetricImpactPhrase(engineKey: string | null, displayValue: string): string {
  if (!displayValue?.trim()) return "";
  const short = getMetricShortName(engineKey);
  const additive: Record<string, boolean> = { tbt: true, mainThread: true, bootupTime: true };
  if (engineKey && additive[engineKey]) {
    return `Adds ${displayValue.trim()} to ${short}`;
  }
  return `Affects ${short} by ${displayValue.trim()}`;
}

/** Safe currency formatter; never hide missing values — use 0 and warn if undefined. */
function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) {
    if (typeof process !== "undefined") console.warn("formatCurrency: missing value, using $0");
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(0);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    if (typeof process !== "undefined") console.warn("formatCurrency: invalid value", value);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(0);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

/**
 * CORTEX v2 narrative: psychologically grounded, stage-based. Dollar amount ALWAYS renders.
 */
function getWhyItMattersNarrative(engineKey: string | null, resourceLeak: number, metricValue?: string): string {
  const stage = engineKeyToCortexStage(engineKey);
  return getImpactNarrativeFallback({ stage, resourceLeak, metricValue });
}

/** Context-aware metric hook for "Why It Matters" (replaces repetitive sentences). */
function getMetricHook(engineKey: string | null): string {
  if (!engineKey) return "performance friction";
  const hooks: Record<string, string> = {
    lcp: "Visual Frustration - Users bounce because the page feels 'dead' on arrival.",
    fcp: "Visual Frustration - Users bounce because the page feels 'dead' on arrival.",
    tti: "Interaction Paralysis - Users abandon carts because the interface is unresponsive to touch.",
    tbt: "Interaction Paralysis - Users abandon carts because the interface is unresponsive to touch.",
    inp: "Interaction Paralysis - Users abandon carts because the interface is unresponsive to touch.",
    mainThread: "Interaction Paralysis - Users abandon carts because the interface is unresponsive to touch.",
    bootupTime: "Interaction Paralysis - Users abandon carts because the interface is unresponsive to touch.",
    cls: "Trust Leak - Layout shifts cause accidental clicks, damaging brand authority and conversion precision.",
    unusedJs: "Payload Friction - Bloated resources throttle the connection, delaying all other critical metrics.",
    unusedCss: "Payload Friction - Bloated resources throttle the connection, delaying all other critical metrics.",
    speedIndex: "Visual Frustration - Users bounce because the page feels 'dead' on arrival.",
    ttfb: "Backend delay - Slow first byte delays paint and interactivity.",
  };
  return hooks[engineKey] ?? "performance friction";
}

/** Specific user behavior for explainer closing sentence. */
function getMetricBehavior(engineKey: string | null): string {
  if (!engineKey) return "lost conversions";
  const behaviors: Record<string, string> = {
    lcp: "bounce before engagement",
    fcp: "bounce before engagement",
    tti: "cart abandonment and lost interactions",
    tbt: "cart abandonment and lost interactions",
    inp: "cart abandonment and lost interactions",
    mainThread: "cart abandonment and lost interactions",
    bootupTime: "cart abandonment and lost interactions",
    cls: "accidental clicks and damaged trust",
    unusedJs: "delayed load and interaction",
    unusedCss: "delayed load and interaction",
    speedIndex: "bounce before engagement",
    ttfb: "delayed paint and interaction",
  };
  return behaviors[engineKey] ?? "lost conversions";
}

/** Impact level derived from attributed dollar amount (Severity Override). If leak > $100k, badge MUST be CRITICAL. */
function getImpactLevelFromDollars(attributedDollars: number, fallback: "High" | "Medium" | "Low"): "CRITICAL" | "HIGH" | "Medium" | "Low" {
  if (attributedDollars >= 100_000) return "CRITICAL";
  if (attributedDollars >= 10_000) return "HIGH";
  return fallback === "High" ? "HIGH" : fallback;
}

/** Badge class from urgency only (FREE/LOCKED tier — no dollar data in DOM). */
function urgencyLevelToBadgeClass(urgency: "High" | "Medium" | "Low"): string {
  return urgency === "High"
    ? "bg-red-500/20 text-red-400"
    : urgency === "Low"
      ? "bg-emerald-500/20 text-emerald-400"
      : "bg-amber-500/20 text-amber-400";
}

/** Unique first sentence for "Why It Matters" per metric (value-aware). displayValue e.g. "12.9 s", "0.25". */
function getMetricFirstSentence(
  engineKey: string | null,
  displayValue: string,
  resourceDollars?: number
): string {
  const val = displayValue?.trim() || "—";
  if (!engineKey) return `This resource contributes to performance friction.`;
  const withDollars = (s: string) =>
    resourceDollars != null && resourceDollars > 0
      ? s.replace("$[X]", `$${resourceDollars.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)
      : s.replace("$[X]", "significant revenue");
  const sentences: Record<string, string> = {
    speedIndex: `Your page feels 'stuck' for ${val}, causing high-value leads to lose trust in your brand.`,
    mainThread: `This ${val} execution block freezes your UI, preventing users from clicking your primary CTA.`,
    unusedJs: withDollars("This infrastructure debt slows down your entire site, costing you $[X] in compound friction."),
    unusedCss: withDollars("This infrastructure debt slows down your entire site, costing you $[X] in compound friction."),
    lcp: `Your largest content paints at ${val}, so users see a blank or stalled experience and bounce.`,
    fcp: `First paint at ${val} makes the page feel dead on arrival, driving high-value visitors away.`,
    tti: `The page isn't interactive until ${val}, so users hit a frozen UI and abandon.`,
    tbt: `This blocking time (${val}) freezes the UI and prevents clicks on your primary CTA.`,
    bootupTime: `Script bootup (${val}) delays interactivity and pushes users away.`,
    cls: `Layout shifts (CLS ${val}) cause accidental clicks and damage trust.`,
    ttfb: `Your server responds in ${val}, delaying everything that follows.`,
    inp: `Input responsiveness at ${val} blocks users from completing high-value actions.`,
  };
  return sentences[engineKey] ?? `This resource hurts your ${getMetricShortName(engineKey)} metric and contributes to revenue leak.`;
}

export default function DetailedMetricsBoard({
  data,
  metricsForDashboard,
  rawAudit = null,
  estimatedMonthlyLeak,
  leakByMetric: leakByMetricProp,
  isProUser = false,
  projectId = null,
  onDemoUpgrade,
  initialOpenMetricKey = null,
  initialAuditTab = null,
  vpv,
  businessContext = "Ecommerce",
}: {
  data: DetailedMetricsData;
  metricsForDashboard?: MetricForDashboard[];
  rawAudit?: Record<string, unknown> | null;
  /** Total monthly revenue leak for attribution to resources (Sprint 2). */
  estimatedMonthlyLeak?: number;
  /** Per-metric leak from getGlobalRevenuePieFromAudits (universal loop). When present, used instead of top-5 distribution. */
  leakByMetric?: Record<string, number>;
  /** If true, show revenue impact, financial narrative, and full blueprint. Must be: user?.plan === "pro" || (typeof window !== "undefined" && localStorage.getItem("demoPro") === "true"). Do not render dollar values in DOM when false. */
  isProUser?: boolean;
  /** Optional projectId for opening financial report in new tab after demo upgrade. */
  projectId?: string | null;
  /** Called after demo upgrade so parent can refresh isPro (e.g. setState). */
  onDemoUpgrade?: () => void;
  /** When set, open the metric drawer for this metricKey (e.g. from /dashboard/[id]?metric=load-tti). */
  initialOpenMetricKey?: string | null;
  /** When "forensic", open Financial Forensic Audit tab (e.g. from ?tab=forensic). */
  initialAuditTab?: string | null;
  /** VPV for CORTEX v3 AI audit (Pro). */
  vpv?: number;
  /** Business context for CORTEX v3 (e.g. Luxury B2B, SaaS, Ecommerce). */
  businessContext?: string;
}) {
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const [showDetailedExplanation, setShowDetailedExplanation] = useState(false);
  const [expandedTechnical, setExpandedTechnical] = useState<Set<number>>(new Set());
  const [proUpgradeModalOpen, setProUpgradeModalOpen] = useState(false);
  const [auditTab, setAuditTab] = useState<AuditTabId>("technical");
  const [upgradeDemoOpen, setUpgradeDemoOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open metric drawer when navigating from Priority Fixes "Open Fix Guide" (e.g. ?metric=load-tti).
  useEffect(() => {
    if (!initialOpenMetricKey || !metricsForDashboard?.length) return;
    const exists = metricsForDashboard.some((m) => m.metricKey === initialOpenMetricKey);
    if (exists) setActiveMetric(initialOpenMetricKey);
  }, [initialOpenMetricKey, metricsForDashboard]);

  // When tab=forensic in URL, always show Financial Forensic Audit (fixes re-click and navigation).
  useEffect(() => {
    if (initialAuditTab === "forensic") setAuditTab("financial");
  }, [initialAuditTab]);

  // When switching metrics, reset tab to default (Technical) unless URL asked for forensic.
  useEffect(() => {
    setShowDetailedExplanation(false);
    setExpandedTechnical(new Set());
    if (initialAuditTab !== "forensic") setAuditTab("technical");
  }, [activeMetric]);

  useEffect(() => {
    if (activeMetric) {
      setPanelEntered(false);
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setPanelEntered(true));
      });
      return () => cancelAnimationFrame(t);
    } else {
      setPanelEntered(false);
    }
  }, [activeMetric]);

  const handleClose = useCallback(() => {
    if (closeTimeoutRef.current) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setActiveMetric(null);
      setIsClosing(false);
      closeTimeoutRef.current = null;
    }, 250);
  }, []);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onEsc);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, [handleClose]);

  const engineKey = activeMetric ? metricKeyToEngineKey(activeMetric) : null;
  const metricIntelligence = useMemo(() => {
    if (!rawAudit || !engineKey) return null;
    const intel = analyzeMetric(rawAudit as { audits?: Record<string, unknown> }, engineKey);
    const explanation = generateMetricAIExplanation({
      metricKey: engineKey,
      metricValue: intel.metricValue,
      keyIssueType: intel.keyIssueType,
      totalResourceCount: intel.contributingResources.length,
    });
    return { intelligence: intel, aiExplanation: explanation };
  }, [rawAudit, engineKey]);

  // Per-metric leak slice from Universal Revenue Pie. Sum of ALL drawer revenue badges = estimatedMonthlyLeak exactly.
  const leakByMetric = useMemo(() => {
    if (typeof leakByMetricProp === "object" && leakByMetricProp !== null && Object.keys(leakByMetricProp).length > 0) {
      return leakByMetricProp;
    }
    const total = typeof estimatedMonthlyLeak === "number" && estimatedMonthlyLeak > 0 ? estimatedMonthlyLeak : 0;
    if (total <= 0) return {} as Record<string, number>;
    const metrics = buildMetricsFromAudit(rawAudit ?? undefined);
    const top = getTopFiveUnderperformers(metrics);
    return distributeLeakBySeverity(total, top);
  }, [rawAudit, estimatedMonthlyLeak, leakByMetricProp]);

  const activeMetricMeta = useMemo(
    () => metricsForDashboard?.find((m) => m.metricKey === activeMetric),
    [metricsForDashboard, activeMetric]
  );
  if (metricsForDashboard && metricsForDashboard.length > 0) {
    const active = activeMetric ? metricsForDashboard.find((m) => m.metricKey === activeMetric) : null;
    const bySection = SECTIONS.map(({ id, title }) => ({
      id,
      title,
      metrics: metricsForDashboard.filter((m) => m.metricKey.startsWith(`${id}-`)),
    })).filter((s) => s.metrics.length > 0);

    return (
      <>
        <div className="ui-panel overflow-hidden shadow-[var(--shadow-soft)]">
          <div className="border-b border-white/10 bg-white/5 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                  Metrics Dashboard
                </h2>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  Core Web Vitals and performance metrics with AI root cause analysis
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-8">
            {bySection.map(({ id, title, metrics }) => (
              <div key={id} id={`metric-${id}`} className="scroll-mt-8 ui-panel ui-panel--muted overflow-hidden">
                <div className="border-b border-white/10 bg-white/5 px-4 py-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--foreground)]">{title}</h3>
                </div>
                <div className="divide-y divide-white/[0.06]">
                  <div className="grid grid-cols-4 items-center gap-4 px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                    <div>Metric</div>
                    <div>Value</div>
                    <div>Verdict</div>
                    <div className="text-right">Root Cause</div>
                  </div>
                  {metrics.map((metric) => {
                    const showRootCause = metric.verdict === "Poor" || metric.verdict === "Needs Improvement";
                    const verdictClass =
                      metric.verdict === "Good"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : metric.verdict === "Needs Improvement"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-red-500/20 text-red-400";
                    const metricSlug = metric.metricKey.split("-").slice(1).join("-");
                    return (
                      <div
                        key={metric.metricKey}
                        id={metricSlug || undefined}
                        className="group grid grid-cols-4 items-center gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-white/[0.04] scroll-mt-8"
                      >
                        <div className="font-medium text-[var(--foreground)]">{metric.label}</div>
                        <div className="text-sm tabular-nums text-[var(--foreground)]">{metric.displayValue}</div>
                        <div>
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${verdictClass}`}>
                            {metric.verdict}
                          </span>
                        </div>
                        <div className="text-right min-w-[6rem]">
                          {showRootCause && (
                            <button
                              type="button"
                              onClick={() => setActiveMetric(metric.metricKey)}
                              className="btn-secondary text-xs py-1.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            >
                              View Details →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {active && (() => {
          const intelligence = metricIntelligence?.intelligence ?? null;
          const aiExplanation = metricIntelligence?.aiExplanation ?? null;
          const shortText = aiExplanation?.shortExplanation ?? active.aiAnalysis?.rootCause ?? "";
          const detailedText = aiExplanation?.detailedExplanation ?? "";
          const fallbackResources = (active.resources ?? [])
            .map((r) => ({ ...r, _size: (r as OffendingResource).wastedBytes ?? (r as OffendingResource).totalBytes ?? 0 }))
            .sort((a, b) => b._size - a._size);
          const fallbackWithLevel = fallbackResources.map((r, i) => {
            const len = fallbackResources.length;
            let urgencyLevel: "High" | "Medium" | "Low" = "Medium";
            if (len > 0) {
              if (i < len / 3) urgencyLevel = "High";
              else if (i >= (2 * len) / 3) urgencyLevel = "Low";
            }
            return {
              url: (r as OffendingResource).url ?? "",
              type: (r as OffendingResource).url ? (resourceTypeBadge((r as OffendingResource).url ?? "")?.label.toLowerCase() ?? "other") : "other",
              urgencyLevel,
              transferSize: (r as OffendingResource).totalBytes ?? 0,
              reason: "Affected resource",
              affects: active.label,
            };
          });
          let resources = (intelligence?.contributingResources?.length
            ? intelligence.contributingResources
            : fallbackWithLevel) as ContributingResource[];
          if (resources.length === 0 && rawAudit) {
            resources = getResourcesFromRawAudit(rawAudit as Record<string, unknown>, active.label) as ContributingResource[];
          }
          const leakForMetric =
            active.verdict === "Good" ? 0 : (engineKey ? resolveLeakForMetricDrawer(engineKey, leakByMetric) : 0);
          const resourcesForAttribution: ResourceForAttribution[] = resources.map((r) => ({
            impactLevel: r.urgencyLevel,
            resourceSize: (r as { transferSize?: number }).transferSize ?? 0,
          }));
          const attributedAmounts = attributeLeakToResources(leakForMetric, resourcesForAttribution);
          const { resources: dedupedResources, attributedAmounts: dedupedAmounts } = deduplicateResourcesByUrl(resources, attributedAmounts);
          const priorityScores = computePriorityScores(dedupedResources, dedupedAmounts);
          const auditId = getAuditIdFromMetricKey(active.metricKey);
          const auditScore = (rawAudit?.audits as Record<string, { score?: number }> | undefined)?.[auditId ?? ""]?.score;
          const metricSeverity = typeof auditScore === "number" && Number.isFinite(auditScore) ? 1 - auditScore : 0.5;
          type DisplayItem = { resource: ContributingResource; attributedLeak: number; priorityScore: number; confidence: "High" | "Medium" | "Low" };
          const withPriority: DisplayItem[] = dedupedResources.map((res, i) => ({
            resource: res,
            attributedLeak: dedupedAmounts[i] ?? 0,
            priorityScore: priorityScores[i] ?? 0,
            confidence: getConfidenceForResource(dedupedAmounts[i] ?? 0, leakForMetric, metricSeverity, dedupedResources.length),
          }));
          const displayItems = [...withPriority].sort((a, b) => b.priorityScore - a.priorityScore);
          const metricConfidence: "High" | "Medium" | "Low" =
            displayItems.length > 0
              ? displayItems.some((it) => it.confidence === "High")
                ? "High"
                : displayItems.some((it) => it.confidence === "Medium")
                  ? "Medium"
                  : "Low"
              : "Low";
          const confidenceExplanation = getConfidenceExplanation(dedupedAmounts, leakForMetric);
          const groupedFreeTier = groupResourcesForFreeTier(dedupedResources);
          const showFinancial = auditTab === "financial" && isProUser;

          return (
            <>
              <div
                className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[4px] transition-opacity duration-300"
                style={{ opacity: isClosing ? 0 : 1 }}
                onClick={handleClose}
                role="dialog"
                aria-modal="true"
                aria-labelledby="panel-title"
              />
              <div
                className="fixed right-0 top-0 z-50 h-full w-[480px] max-w-[100vw] overflow-y-auto border-l border-white/[0.08] bg-[#0a0a0a]/92 shadow-[-8px_0_32px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                style={{
                  transform: isClosing ? "translateX(100%)" : panelEntered ? "translateX(0)" : "translateX(100%)",
                  transition: "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 relative">
                  <div className="flex items-start justify-between gap-4 mb-5 pb-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[var(--foreground)]">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <h3 id="panel-title" className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                        {active.label}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded-[var(--radius-button)] p-1.5 text-[var(--muted)] hover:bg-white/10 hover:text-[var(--foreground)] transition"
                      aria-label="Close"
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  <MetricAuditTabs activeTab={auditTab} onTabChange={setAuditTab} />

                  {shortText ? (
                    <>
                      {auditTab === "technical" && (
                        <div className="border-b border-white/10 pb-4 mb-4">
                          <p className="text-sm text-[var(--foreground)] leading-relaxed">{shortText}</p>
                          {detailedText ? (
                            <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">{detailedText}</p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            <span className="text-[10px] font-medium text-[var(--muted)]">
                              Impact: <span className="text-[var(--foreground)]">{intelligence?.overallImpactLevel ?? resources[0]?.urgencyLevel ?? "—"}</span>
                            </span>
                            {STRATEGIC_CONTEXT[active.label] && (
                              <span className="text-[10px] text-[var(--muted)]">{STRATEGIC_CONTEXT[active.label]}</span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="border-b border-white/10 pb-4 mb-4" key={activeMetric}>
                        {!isProUser ? (
                          <>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-sm font-semibold text-[var(--foreground)]">
                                Top contributing causes
                              </span>
                            </div>
                            <div className="space-y-2 mb-4">
                              {groupedFreeTier.map((group, index) => (
                                <div key={`${group.label}-${index}`} className="rounded-lg border border-white/[0.06] bg-white/5 py-2.5 px-4 resource-card">
                                  <div className="font-semibold text-sm text-[var(--foreground)]">{group.label}</div>
                                  <div className="text-xs opacity-70 text-[var(--muted)]">{group.count} resources</div>
                                </div>
                              ))}
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                              <p className="font-medium text-[var(--foreground)] mb-2">
                                See exactly what is costing you revenue
                              </p>
                              <p className="text-[var(--muted)] mb-3">
                                Unlock the specific files slowing your site, the revenue impact of each resource, and the exact fixes to recover lost conversions.
                              </p>
                              <button
                                type="button"
                                onClick={() => setUpgradeDemoOpen(true)}
                                className="rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90 w-full"
                              >
                                Unlock Performance Intelligence
                              </button>
                              <p className="text-[10px] text-[var(--muted)] mt-2 text-center">
                                Founders use this to prioritize fixes that directly improve revenue.
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            {showFinancial && leakForMetric > 0 && (
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="text-sm font-semibold text-[var(--foreground)]">
                                  {formatCurrency(leakForMetric)}/mo
                                </span>
                                <span className="text-[10px] text-[var(--muted)]" title="Confidence in revenue estimate">
                                  {metricConfidence} confidence
                                  {confidenceExplanation ? ` • ${confidenceExplanation}` : ""}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-sm font-semibold text-[var(--foreground)]">
                                {displayItems.length > 10
                                  ? `Top contributing resources (10 of ${displayItems.length})`
                                  : `Contributing Resources (${displayItems.length})`}
                              </span>
                            </div>
                            <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
                              {displayItems.slice(0, 10).map((item, idx) => {
                                const res = item.resource;
                                const typeLabel =
                                  res.type === "js"
                                    ? "JavaScript"
                                    : res.type === "css"
                                      ? "CSS"
                                      : res.type === "image"
                                        ? "Image"
                                        : res.type === "font"
                                          ? "Font"
                                          : res.type === "document"
                                            ? "Document"
                                            : "Container";
                                const typeBadge = res.url && !res.url.startsWith("<") ? resourceTypeBadge(res.url) : null;
                                const displayName = showFinancial
                                  ? (res.url && res.url.length > 60 ? truncateUrl(res.url) : res.url || "Element")
                                  : getGenericResourceLabel(res.type);
                                const urgencyOnlyCls = urgencyLevelToBadgeClass(res.urgencyLevel);
                                const resourceLeak = showFinancial ? item.attributedLeak : 0;
                                const impactLevelPro = getImpactLevelFromDollars(resourceLeak, res.urgencyLevel);
                                const urgencyClsPro =
                                  impactLevelPro === "CRITICAL"
                                    ? "bg-red-600/30 text-red-300"
                                    : impactLevelPro === "HIGH"
                                      ? "bg-red-500/20 text-red-400"
                                      : impactLevelPro === "Medium"
                                        ? "bg-amber-500/20 text-amber-400"
                                        : "bg-emerald-500/20 text-emerald-400";
                                const revenueImpactFormatted =
                                  resourceLeak > 0 ? `${formatCurrency(resourceLeak)}/mo` : "";
                                const metricImpactPhrase = getMetricImpactPhrase(engineKey, active.displayValue);
                                const rec = showFinancial ? getMetricResourceRecommendation(active.label, res as ContributingResource) : null;
                                const metricShortName = getMetricShortName(engineKey);

                                return (
                                  <div key={idx} className="bg-white/5 rounded-lg py-3 px-4 border border-white/[0.06]">
                                    <div className="flex items-start justify-between gap-2">
                                      <div
                                        className="font-medium text-sm text-[var(--foreground)] truncate min-w-0"
                                        title={showFinancial ? res.url : undefined}
                                      >
                                        {displayName}
                                      </div>
                                      {metricImpactPhrase && (
                                        <span className="text-[10px] font-semibold text-red-400 shrink-0 tabular-nums">
                                          +{active.displayValue}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                      <span
                                        className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${(typeBadge ?? {
                                          cls: "bg-white/10 text-[var(--muted)]",
                                        }).cls}`}
                                      >
                                        {typeBadge ? typeBadge.label : typeLabel}
                                      </span>
                                      <span
                                        className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${urgencyOnlyCls}`}
                                      >
                                        {res.urgencyLevel}
                                      </span>
                                      {showFinancial && resourceLeak > 0 && (
                                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#befe34]/20 text-[var(--accent)]" title={`${item.confidence} confidence`}>
                                          {revenueImpactFormatted}
                                          <span className="text-[var(--muted)] font-normal ml-1">· {item.confidence}</span>
                                        </span>
                                      )}
                                    </div>
                                    {showFinancial && rec && (
                                      <div className="mt-3 pt-3 border-t border-white/[0.06]">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">Why this matters</p>
                                        <p className="text-[11px] text-[var(--muted)] mb-2">{rec.why}</p>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">Recommended fix</p>
                                        <p className="text-[11px] text-[var(--foreground)]">{rec.action}</p>
                                        {resourceLeak > 0 && (
                                          <>
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mt-2 mb-1">Expected improvement</p>
                                            <p className="text-[11px] text-[var(--muted)]">Recover {revenueImpactFormatted} in {metricShortName} revenue.</p>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  ) : active.aiAnalysis ? (
                    <>
                      {auditTab === "technical" && (
                        <div className="border-b border-white/10 pb-3 mb-3">
                          <p className="text-sm text-[var(--foreground)] line-clamp-2 leading-snug">{active.aiAnalysis.rootCause}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="text-[10px] font-medium text-[var(--muted)]">Impact: <span className="text-[var(--foreground)]">Medium</span></span>
                            {STRATEGIC_CONTEXT[active.label] && (
                              <span className="text-[10px] text-[var(--muted)]">{STRATEGIC_CONTEXT[active.label]}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {active.resources && active.resources.length > 0 && (() => {
                        const fallbackEngineKey = metricKeyToEngineKey(active.metricKey);
                        const fallbackLeak =
                          active.verdict === "Good"
                            ? 0
                            : fallbackEngineKey
                              ? resolveLeakForMetricDrawer(fallbackEngineKey, leakByMetric)
                              : 0;
                        const fallbackResourcesList: ContributingResource[] = active.resources.map((res) => {
                          const badge = res.url ? resourceTypeBadge(res.url) : null;
                          return {
                            url: res.url ?? "",
                            type: badge?.label.toLowerCase() ?? "other",
                            urgencyLevel: "Medium" as const,
                            transferSize: res.totalBytes ?? 0,
                            reason: "Affected resource",
                            affects: active.label,
                          };
                        });
                        const fallbackResourcesForAttribution: ResourceForAttribution[] = fallbackResourcesList.map((r) => ({
                          impactLevel: "Medium",
                          resourceSize: r.transferSize ?? 0,
                        }));
                        const fallbackAmounts = attributeLeakToResources(fallbackLeak, fallbackResourcesForAttribution);
                        const { resources: dedupedFallbackResources, attributedAmounts: dedupedFallbackAmounts } = deduplicateResourcesByUrl(fallbackResourcesList, fallbackAmounts);
                        const fallbackPriorityScores = computePriorityScores(dedupedFallbackResources, dedupedFallbackAmounts);
                        const fallbackAuditId = getAuditIdFromMetricKey(active.metricKey);
                        const fallbackAuditScore = (rawAudit?.audits as Record<string, { score?: number }> | undefined)?.[fallbackAuditId ?? ""]?.score;
                        const fallbackMetricSeverity = typeof fallbackAuditScore === "number" && Number.isFinite(fallbackAuditScore) ? 1 - fallbackAuditScore : 0.5;
                        type FallbackDisplayItem = { resource: ContributingResource; attributedLeak: number; priorityScore: number; confidence: "High" | "Medium" | "Low" };
                        const fallbackWithPriority: FallbackDisplayItem[] = dedupedFallbackResources.map((res, i) => ({
                          resource: res,
                          attributedLeak: dedupedFallbackAmounts[i] ?? 0,
                          priorityScore: fallbackPriorityScores[i] ?? 0,
                          confidence: getConfidenceForResource(dedupedFallbackAmounts[i] ?? 0, fallbackLeak, fallbackMetricSeverity, dedupedFallbackResources.length),
                        }));
                        const fallbackDisplayItems = [...fallbackWithPriority].sort((a, b) => b.priorityScore - a.priorityScore);
                        const groupedFallbackFreeTier = groupResourcesForFreeTier(dedupedFallbackResources);
                        const fallbackShowFinancial = auditTab === "financial" && isProUser;
                        if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
                          const fallbackSum = fallbackAmounts.reduce((s, a) => s + (a ?? 0), 0);
                          const fallbackMatch = Math.abs(fallbackSum - fallbackLeak) <= 0.02;
                          console.log("--- CORTEX DIAGNOSTIC (fallback) ---");
                          console.log("Metric:", fallbackEngineKey, "| fallbackLeak:", fallbackLeak, "| Sum(resourceLeaks):", fallbackSum);
                          console.log("Sum(resourceLeaks) === totalLeak:", fallbackMatch ? "PASS" : "FAIL");
                        }
                        return (
                          <div className="mt-3">
                            {!isProUser ? (
                              <>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="text-sm font-semibold text-[var(--foreground)]">Top contributing causes</span>
                                </div>
                                <div className="space-y-2 mb-4">
                                  {groupedFallbackFreeTier.map((group, index) => (
                                    <div key={`${group.label}-${index}`} className="rounded-lg border border-white/[0.06] bg-white/5 py-2.5 px-4 resource-card">
                                      <div className="font-semibold text-sm text-[var(--foreground)]">{group.label}</div>
                                      <div className="text-xs opacity-70 text-[var(--muted)]">{group.count} resources</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                                  <p className="font-medium text-[var(--foreground)] mb-2">See exactly what is costing you revenue</p>
                                  <p className="text-[var(--muted)] mb-3">
                                    Unlock the specific files slowing your site, the revenue impact of each resource, and the exact fixes to recover lost conversions.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setUpgradeDemoOpen(true)}
                                    className="rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90 w-full"
                                  >
                                    Unlock Performance Intelligence
                                  </button>
                                  <p className="text-[10px] text-[var(--muted)] mt-2 text-center">
                                    Founders use this to prioritize fixes that directly improve revenue.
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="text-sm font-semibold text-[var(--foreground)]">
                                    {fallbackDisplayItems.length > 10
                                      ? `Top contributing resources (10 of ${fallbackDisplayItems.length})`
                                      : `Contributing Resources (${fallbackDisplayItems.length})`}
                                  </span>
                                </div>
                                <div className="max-h-[50vh] overflow-y-auto space-y-2">
                                  {fallbackDisplayItems.slice(0, 10).map((item, i) => {
                                    const res = item.resource;
                                    const badge = res.url ? resourceTypeBadge(res.url) : null;
                                    const urgencyOnlyCls = urgencyLevelToBadgeClass("Medium");
                                    const resourceLeak = fallbackShowFinancial ? item.attributedLeak : 0;
                                    const impactLevelPro = getImpactLevelFromDollars(resourceLeak, "Medium");
                                    const urgencyClsPro =
                                      impactLevelPro === "CRITICAL"
                                        ? "bg-red-600/30 text-red-300"
                                        : impactLevelPro === "HIGH"
                                          ? "bg-red-500/20 text-red-400"
                                          : impactLevelPro === "Medium"
                                            ? "bg-amber-500/20 text-amber-400"
                                            : "bg-emerald-500/20 text-emerald-400";
                                    const revenueImpactFormatted =
                                      resourceLeak > 0 ? `${formatCurrency(resourceLeak)}/mo` : "";
                                    const rec = fallbackShowFinancial ? getMetricResourceRecommendation(active.label, res) : null;
                                    const fallbackMetricShortName = getMetricShortName(fallbackEngineKey);
                                    const fallbackDisplayName = fallbackShowFinancial
                                      ? (res.url ? truncateUrl(res.url) : "Unknown")
                                      : getGenericResourceLabel(res.type);
                                    return (
                                      <div key={i} className="bg-white/5 rounded-lg py-2 px-3 border border-white/[0.06]">
                                        <div className="flex items-start justify-between gap-2">
                                          <div
                                            className="font-medium text-sm text-[var(--foreground)] truncate min-w-0"
                                            title={fallbackShowFinancial ? res.url : undefined}
                                          >
                                            {fallbackDisplayName}
                                          </div>
                                          {active.displayValue && (
                                            <span className="text-[10px] font-semibold text-red-400 shrink-0 tabular-nums">
                                              +{active.displayValue}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                          {badge && (
                                            <span
                                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${badge.cls}`}
                                            >
                                              {badge.label}
                                            </span>
                                          )}
                                          <span
                                            className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${urgencyOnlyCls}`}
                                          >
                                            Medium
                                          </span>
                                          {fallbackShowFinancial && resourceLeak > 0 && (
                                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#befe34]/20 text-[var(--accent)]" title={`${item.confidence} confidence`}>
                                              {revenueImpactFormatted}
                                              <span className="text-[var(--muted)] font-normal ml-1">· {item.confidence}</span>
                                            </span>
                                          )}
                                        </div>
                                        {fallbackShowFinancial && rec && (
                                          <div className="mt-3 pt-3 border-t border-white/[0.06]">
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">Why this matters</p>
                                            <p className="text-[11px] text-[var(--muted)] mb-2">{rec.why}</p>
                                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">Recommended fix</p>
                                            <p className="text-[11px] text-[var(--foreground)]">{rec.action}</p>
                                            {resourceLeak > 0 && (
                                              <>
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] mt-2 mb-1">Expected improvement</p>
                                                <p className="text-[11px] text-[var(--muted)]">Recover {revenueImpactFormatted} in {fallbackMetricShortName} revenue.</p>
                                              </>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">No AI analysis available for this metric.</p>
                  )}

                </div>
              </div>
            </>
          );
        })()}
      <UpgradeModal
        open={upgradeDemoOpen}
        onOpenChange={setUpgradeDemoOpen}
        metricKey={activeMetric}
        projectId={projectId ?? undefined}
        onUpgraded={onDemoUpgrade}
      />
      <ProUpgradeModal open={proUpgradeModalOpen} onOpenChange={setProUpgradeModalOpen} />
      </>
    );
  }

  if (!data) return null;

  return (
    <div className="ui-panel ui-panel--muted overflow-hidden shadow-[var(--shadow-soft)]">
      <div className="border-b border-white/10 bg-white/5 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[var(--foreground)]">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
              Metrics Dashboard
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Core Web Vitals and performance metrics
            </p>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-8">
        {SECTIONS.map(({ id, title }) => {
          const metricDefs = SECTION_METRIC_IDS[id] ?? [];
          const sectionData = data[id as keyof DetailedMetricsData];
          const rows: { label: string; displayValue: string; score: number | null | undefined }[] = [];

          for (const { key, id: auditId } of metricDefs) {
            const metric = sectionData?.[key] as AuditLike;
            if (!metric) continue;
            const numericValue = metric.numericValue;
            if (numericValue == null || numericValue === undefined) continue;
            const label = METRIC_LABELS[auditId];
            if (!label) continue;
            const displayValue = formatMetricValue(auditId, numericValue);
            if (displayValue === null) continue;
            rows.push({ label, displayValue, score: metric.score });
          }

          if (rows.length === 0) return null;

          return (
            <div key={id} id={id} className="scroll-mt-8 ui-panel ui-panel--muted overflow-hidden">
              <div className="border-b border-white/10 bg-white/5 px-4 py-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--foreground)]">{title}</h3>
              </div>
              <div className="divide-y divide-white/10">
                {rows.map((row, index) => (
                  <MetricRow
                    key={`${id}-${row.label}-${index}`}
                    label={row.label}
                    displayValue={row.displayValue}
                    score={row.score}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
