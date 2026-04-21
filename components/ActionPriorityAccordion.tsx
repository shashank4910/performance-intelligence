"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { attributeLeakToResources, type ResourceForAttribution } from "@/lib/impactEngine/revenueLeakCalculator";
import { resolveLeakForMetricDrawer } from "@/lib/headlineRevenueLeak";
import {
  comparePriorityFixes,
  computeStageMetricWeights,
  type RevenueStageSnapshot,
} from "@/lib/revenueStageDistribution";

type OffendingResource = {
  url: string | null;
  totalBytes: number;
  wastedBytes: number;
  element: string | null;
};

type MetricRow = {
  metricKey: string;
  label: string;
  displayValue: string;
  verdict: string;
  resources?: OffendingResource[];
};

export type ActionPriorityAccordionProps = {
  leakByMetric: Record<string, number>;
  metricsForDashboard?: MetricRow[] | null;
  estimatedMonthlyLeak?: number;
  isProUser: boolean;
  onDemoUpgrade?: () => void;
  /** Project ID for "Open Fix Guide" navigation to dashboard metric drawer. */
  projectId?: string | null;
  /**
   * Optional snapshot (LCP/INP/TBT/CLS in analyze units) so fix ordering follows
   * metric-driven funnel impact, not only attributed dollars.
   */
  revenueStageSnapshot?: RevenueStageSnapshot | null;
};

/** Business problem category for an optimization action. */
type BusinessProblem = "Speed" | "SEO" | "Conversion";

/** Single optimization action (group of resources), ranked by revenue impact. */
type ActionItem = {
  actionGroupKey: string;
  businessProblem: BusinessProblem;
  recommendedAction: string;
  totalRevenueImpact: number;
  priorityLevel: "High" | "Medium" | "Low";
  resourceCount: number;
  exampleResources: string[];
  /** Primary metric key for this group (e.g. "tti") for confidence and navigation. */
  primaryEngineKey: string;
  /** Dashboard metricKey (e.g. "load-tti") for opening drawer. */
  primaryMetricKey: string | null;
  /** Confidence from attribution weight (resource share of metric leak). */
  confidence: "High" | "Medium" | "Low";
  /** Display label for primary metric (e.g. "Time to Interactive (TTI)"). */
  metricLabel: string;
  /** Short cause phrase (e.g. "Blocking JavaScript execution"). */
  causeLabel: string;
  /** Business-facing title (e.g. "Improve checkout responsiveness"). */
  businessTitle: string;
  /** Effort heuristic. */
  effort: "Low" | "Medium" | "High";
  /** Expected improvement copy (e.g. "TTI improvement: faster interactivity"). */
  expectedImprovement: string;
  /** Priority score for ranking: totalRevenueImpact / effortWeight. Higher = fix first. */
  priorityScore: number;
  /** Numeric effort weight for sorting (Low=1, Medium=1.5, High=2). */
  effortWeight: number;
  /** Revenue attributed per metric engine key (for Impacts: line), after any scaling. */
  leakByEngineKey: Record<string, number>;
};

function metricKeyToEngineKey(metricKey: string): string {
  const parts = metricKey.split("-");
  return parts.slice(1).join("-") || metricKey;
}

function resourceTypeFromUrl(url: string | null): string {
  if (!url) return "other";
  const lower = url.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|svg|ico)/.test(lower)) return "image";
  if (/\.js(\?|$)/.test(lower)) return "javascript";
  if (/\.css(\?|$)/.test(lower)) return "css";
  if (/\.(woff2?|ttf|otf|eot)/.test(lower)) return "font";
  if (/(google-analytics|googletagmanager|gtag|facebook|hotjar|segment|mixpanel)/.test(lower)) return "third-party";
  return "other";
}

function displayResourceName(url: string | null, element: string | null): string {
  if (url) {
    try {
      const u = new URL(url);
      const path = u.pathname.split("/").pop() || u.pathname;
      return path.length > 40 ? path.slice(0, 37) + "..." : path;
    } catch {
      return url.length > 40 ? url.slice(0, 37) + "..." : url;
    }
  }
  if (element) return element.length > 40 ? element.slice(0, 37) + "..." : element;
  return "Unknown resource";
}

/** Map resource type + metric to optimization action group key. */
function getActionGroupKey(resourceType: string, engineKey: string): string {
  const t = resourceType.toLowerCase();
  const k = engineKey.toLowerCase();
  if (k === "cls") return "layout-shift";
  if (t === "third-party") return "third-party-scripts";
  if (k === "unusedjs" || k === "unusedcss") return "unused-css-js";
  if (t === "image") return "image-optimization";
  if (t === "font") return "font-loading";
  if (t === "javascript") return "javascript-blocking";
  if (k === "ttfb" || t === "document") return "server-response";
  if (t === "css") return "css-blocking";
  return "other";
}

/** Human-readable label for action group. */
function getActionGroupLabel(key: string): string {
  const labels: Record<string, string> = {
    "javascript-blocking": "JavaScript blocking",
    "image-optimization": "Image optimization",
    "font-loading": "Font loading",
    "third-party-scripts": "Third-party scripts",
    "server-response": "Server response",
    "unused-css-js": "Unused CSS/JS",
    "css-blocking": "Render blocking stylesheets",
    "layout-shift": "Layout shift",
    other: "Other optimizations",
  };
  return labels[key] ?? key;
}

/** Map action group to business problem category. */
function getBusinessProblem(key: string): BusinessProblem {
  const map: Record<string, BusinessProblem> = {
    "javascript-blocking": "Conversion",
    "image-optimization": "Speed",
    "font-loading": "Speed",
    "third-party-scripts": "Conversion",
    "server-response": "SEO",
    "unused-css-js": "Speed",
    "css-blocking": "Speed",
    "layout-shift": "Conversion",
    other: "Speed",
  };
  return map[key] ?? "Speed";
}

/** One-line recommended action for the group. */
function getRecommendedActionForGroup(key: string): string {
  const actions: Record<string, string> = {
    "javascript-blocking": "Defer or code-split blocking scripts; load after first paint or on interaction.",
    "image-optimization": "Use next-gen formats (WebP/AVIF), add dimensions, and preload LCP image.",
    "font-loading": "Use font-display: swap or optional; preload critical fonts only.",
    "third-party-scripts": "Load analytics/tag manager asynchronously or after user interaction.",
    "server-response": "Improve TTFB with CDN, caching, and server/database optimization.",
    "unused-css-js": "Remove unused code or code-split by route; tree-shake and lazy-load.",
    "css-blocking": "Inline critical CSS and defer non-critical styles.",
    "layout-shift": "Reserve space for images and fonts (width/height or aspect-ratio) to prevent layout shift.",
    other: "Optimize load order and reduce critical path.",
  };
  return actions[key] ?? "Optimize this resource category.";
}

/** Cause label for card (technical reason). */
function getCauseLabel(key: string): string {
  const labels: Record<string, string> = {
    "javascript-blocking": "Blocking JavaScript execution",
    "image-optimization": "Unoptimized or oversized images",
    "font-loading": "Render-blocking or unoptimized fonts",
    "third-party-scripts": "Third-party scripts (analytics/tag manager)",
    "server-response": "Slow server response (TTFB)",
    "unused-css-js": "Unused CSS or JavaScript",
    "css-blocking": "Render-blocking stylesheets",
    "layout-shift": "Layout shift (missing dimensions)",
    other: "Critical path or load order",
  };
  return labels[key] ?? "Resource optimization";
}

/** Business-facing title for the card. */
function getBusinessTitle(key: string): string {
  const titles: Record<string, string> = {
    "javascript-blocking": "Improve checkout responsiveness",
    "image-optimization": "Improve first impression speed",
    "font-loading": "Improve text rendering speed",
    "third-party-scripts": "Move analytics scripts after first interaction",
    "server-response": "Improve server response time",
    "unused-css-js": "Reduce payload and parse cost",
    "css-blocking": "Reduce render-blocking styles",
    "layout-shift": "Stabilize layout and prevent shifts",
    other: "Optimize critical path",
  };
  return titles[key] ?? getActionGroupLabel(key);
}

/** Effort heuristic by action group (resource count + type). */
function getEffortForGroup(key: string, resourceCount: number): "Low" | "Medium" | "High" {
  const lowEffort = ["third-party-scripts", "font-loading"];
  const highEffort = ["server-response", "unused-css-js"];
  if (lowEffort.includes(key) && resourceCount <= 3) return "Low";
  if (highEffort.includes(key) || resourceCount > 5) return "High";
  return "Medium";
}

/** Effort weight for priority score: revenue per unit of effort. Used in priorityScore = totalRevenueImpact / effortWeight. */
function getEffortWeight(effort: "Low" | "Medium" | "High"): number {
  if (effort === "Low") return 1;
  if (effort === "Medium") return 1.5;
  if (effort === "High") return 2;
  return 1.5;
}

/** Minimum revenue impact to count as a "revenue fix" after scaling (filters noise). */
const MIN_REVENUE_FOR_PRIORITY_FIX = 0.01;

const TOP_EXPANDED_FIXES = 2;

function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Engine keys from attribution → short labels for "Impacts:" (actual contribution order uses dollar amounts). */
function engineKeyToImpactLabel(engineKey: string): string {
  const k = engineKey.toLowerCase().replace(/-/g, "");
  const map: Record<string, string> = {
    lcp: "LCP",
    tti: "TTI",
    tbt: "TBT",
    cls: "CLS",
    fcp: "FCP",
    inp: "INP",
    speedindex: "Speed Index",
    ttfb: "TTFB",
    mainthread: "Main thread",
    bootuptime: "Bootup",
    unusedjs: "Unused JS",
    unusedcss: "Unused CSS",
  };
  return map[k] ?? engineKey.replace(/-/g, " ").toUpperCase();
}

/** Sorted metric labels by dollar contribution (highest first). */
function impactsLabelsFromLeakByEngine(leakByEngineKey: Record<string, number>): string[] {
  return Object.entries(leakByEngineKey)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => engineKeyToImpactLabel(key));
}

/** Scale fix rows so sum of recoveries matches total estimated loss (when provided). */
function scaleFixesToTotalLoss(fixes: ActionItem[], estimatedMonthlyLeak: number | undefined): ActionItem[] {
  const rawSum = fixes.reduce((s, f) => s + f.totalRevenueImpact, 0);
  const target =
    typeof estimatedMonthlyLeak === "number" && Number.isFinite(estimatedMonthlyLeak) && estimatedMonthlyLeak > 0
      ? estimatedMonthlyLeak
      : rawSum;
  if (rawSum <= 0 || fixes.length === 0) return fixes;
  const scale = target / rawSum;
  const scaled = fixes.map((f) => {
    const leakByEngineKey: Record<string, number> = {};
    for (const [k, v] of Object.entries(f.leakByEngineKey)) {
      leakByEngineKey[k] = roundMoney(v * scale);
    }
    const totalRevenueImpact = roundMoney(f.totalRevenueImpact * scale);
    return {
      ...f,
      totalRevenueImpact,
      priorityLevel: priorityFromDollars(totalRevenueImpact),
      leakByEngineKey,
    };
  });
  const sum = scaled.reduce((s, f) => s + f.totalRevenueImpact, 0);
  const drift = roundMoney(target - sum);
  if (scaled[0] && Math.abs(drift) >= 0.005) {
    scaled[0].totalRevenueImpact = roundMoney(scaled[0].totalRevenueImpact + drift);
    scaled[0].priorityLevel = priorityFromDollars(scaled[0].totalRevenueImpact);
  }
  return scaled;
}

/** Expected improvement copy by metric (engine key). */
function getExpectedImprovementForMetric(engineKey: string): string {
  const k = engineKey.toLowerCase();
  const map: Record<string, string> = {
    lcp: "LCP improvement: faster largest contentful paint",
    tti: "TTI improvement: faster time to interactive",
    tbt: "TBT improvement: less blocking time",
    cls: "CLS improvement: more stable layout",
    fcp: "FCP improvement: faster first paint",
    speedindex: "Speed Index improvement: faster visual population",
    ttfb: "TTFB improvement: faster server response",
    unusedjs: "Smaller payload and faster parse",
    unusedcss: "Smaller payload and faster style resolution",
    mainthread: "Main thread: less blocking work",
    bootuptime: "Bootup time: faster script startup",
  };
  return map[k] ?? `${engineKey.toUpperCase()} improvement`;
}

/** Metric short label for "Metric affected" (e.g. "Time to Interactive (TTI)"). */
function getMetricShortLabel(engineKey: string): string {
  const k = engineKey.toLowerCase();
  const map: Record<string, string> = {
    lcp: "Largest Contentful Paint (LCP)",
    tti: "Time to Interactive (TTI)",
    tbt: "Total Blocking Time (TBT)",
    cls: "Cumulative Layout Shift (CLS)",
    fcp: "First Contentful Paint (FCP)",
    speedindex: "Speed Index",
    ttfb: "Server Response Time (TTFB)",
    unusedjs: "Unused JavaScript",
    unusedcss: "Unused CSS",
    mainthread: "Main Thread Work",
    bootuptime: "Bootup Time",
  };
  return map[k] ?? engineKey.toUpperCase();
}

/** Confidence from attribution weight (align with getConfidenceForResource logic). */
function confidenceFromWeight(weight: number): "High" | "Medium" | "Low" {
  if (weight > 0.6) return "High";
  if (weight > 0.3) return "Medium";
  return "Low";
}

/** Human-readable resource label (founder-friendly; no raw filenames). */
function getResourceGroupLabel(url: string | null, filename: string): string {
  if (!url && !filename) return "Other resource";
  const lower = (url ?? filename ?? "").toLowerCase();
  if (/gtm|googletagmanager/i.test(lower)) return "Tag manager script";
  if (/(google-analytics|gtag|analytics)/.test(lower)) return "Analytics script";
  if (/(facebook|hotjar|segment|mixpanel|tracking)/.test(lower)) return "Marketing tracker";
  if (/\.(jpe?g|png|gif|webp|avif|svg|ico)/.test(lower)) return "Image asset";
  if (/\.(woff2?|ttf|otf|eot)/.test(lower)) return "Font asset";
  if (/main\.|bundle\.|app\.|chunk\.|framework\.|vendor\./i.test(filename || lower)) return "Main site script";
  if (/\.css(\?|$)/.test(lower)) return "Stylesheet";
  if (/\.js(\?|$)/.test(lower)) return "JavaScript bundle";
  return "Other script";
}

/** Short user-impact explanation (one line) for the problem. */
function getImpactExplanation(key: string): string {
  const map: Record<string, string> = {
    "javascript-blocking": "Users cannot interact with your page quickly because scripts block loading.",
    "image-optimization": "The main content image loads slowly, so visitors see a blank or delayed first impression.",
    "font-loading": "Text and layout wait on fonts, delaying when your content looks ready.",
    "third-party-scripts": "Analytics and tag scripts delay when users can interact with your site.",
    "server-response": "A slow server response delays everything that loads after it.",
    "unused-css-js": "Extra code is loaded and parsed, slowing down the page without benefit.",
    "css-blocking": "Stylesheets block the browser from painting content until they load.",
    "layout-shift": "Content jumps as it loads, causing accidental clicks and hurting trust.",
    other: "Load order and resource size delay when your page feels ready.",
  };
  return map[key] ?? "This issue delays when your page is ready for users.";
}

function priorityFromDollars(amount: number): "High" | "Medium" | "Low" {
  if (amount >= 500) return "High";
  if (amount >= 100) return "Medium";
  return "Low";
}

function formatCurrency(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Metric short code for badge (e.g. TTI, LCP, CLS). */
function getMetricBadgeCode(engineKey: string): string {
  const k = engineKey.toLowerCase();
  const map: Record<string, string> = {
    lcp: "LCP", tti: "TTI", tbt: "TBT", cls: "CLS", fcp: "FCP",
    speedindex: "Speed", ttfb: "TTFB", unusedjs: "Unused JS", unusedcss: "Unused CSS",
    mainthread: "Main", bootuptime: "Bootup",
  };
  return map[k] ?? engineKey.toUpperCase().slice(0, 6);
}

export default function ActionPriorityAccordion({
  leakByMetric,
  metricsForDashboard,
  estimatedMonthlyLeak,
  isProUser,
  onDemoUpgrade,
  projectId,
  revenueStageSnapshot,
}: ActionPriorityAccordionProps) {
  const [expandPastTop, setExpandPastTop] = useState<Record<string, boolean>>({});

  const { revenueFixes, optimizationFixes, recoverUpTo, totalLossBaseline, deeperRemainingLoss } = useMemo(() => {
    if (!leakByMetric || typeof leakByMetric !== "object" || !metricsForDashboard?.length) {
      return {
        revenueFixes: [] as ActionItem[],
        optimizationFixes: [] as ActionItem[],
        recoverUpTo: 0,
        totalLossBaseline: 0,
        deeperRemainingLoss: 0,
      };
    }

    // 1. Collect all resource-level attributions (url, type, engineKey, amount, displayName)
    type Row = { url: string; type: string; engineKey: string; amount: number; displayName: string };
    const rows: Row[] = [];

    for (const row of metricsForDashboard) {
      const engineKey = metricKeyToEngineKey(row.metricKey);
      const leak = resolveLeakForMetricDrawer(engineKey, leakByMetric);
      if (leak <= 0 || !row.resources?.length) continue;

      const resourcesForAttribution: ResourceForAttribution[] = row.resources.map((r, i) => {
        const len = row.resources!.length;
        let level: "High" | "Medium" | "Low" = "Medium";
        if (len > 0) {
          if (i < len / 3) level = "High";
          else if (i >= (2 * len) / 3) level = "Low";
        }
        return { impactLevel: level, resourceSize: r.totalBytes || r.wastedBytes || 0 };
      });

      const amounts = attributeLeakToResources(leak, resourcesForAttribution);

      row.resources.forEach((res, i) => {
        const amount = amounts[i] ?? 0;
        if (amount <= 0) return;
        const url = res.url ?? "";
        const type = resourceTypeFromUrl(res.url);
        const displayName = displayResourceName(res.url, res.element);
        const name = displayName !== "Unknown resource" ? displayName : type;
        rows.push({ url, type, engineKey, amount, displayName: name });
      });
    }

    // 2. Deduplicate by URL: sum amounts, collect display names and keep type/engineKey
    let emptyKeyIdx = 0;
    const byUrl = new Map<string, { amount: number; names: Set<string>; type: string; engineKey: string }>();
    for (const r of rows) {
      const key = r.url ? r.url : `__empty_${emptyKeyIdx++}`;
      if (byUrl.has(key)) {
        const existing = byUrl.get(key)!;
        existing.amount += r.amount;
        existing.names.add(r.displayName);
      } else {
        byUrl.set(key, { amount: r.amount, names: new Set([r.displayName]), type: r.type, engineKey: r.engineKey });
      }
    }

    // 3. Group into action groups; track leak by engineKey per group for primary metric and confidence
    type Agg = {
      totalRevenueImpact: number;
      resourceCount: number;
      exampleResources: string[];
      leakByEngineKey: Record<string, number>;
    };
    const byAction = new Map<string, Agg>();

    byUrl.forEach(({ amount, names, type, engineKey }) => {
      const groupKey = getActionGroupKey(type, engineKey);

      if (!byAction.has(groupKey)) {
        byAction.set(groupKey, {
          totalRevenueImpact: 0,
          resourceCount: 0,
          exampleResources: [],
          leakByEngineKey: {},
        });
      }
      const agg = byAction.get(groupKey)!;
      agg.totalRevenueImpact += amount;
      agg.resourceCount += 1;
      agg.leakByEngineKey[engineKey] = (agg.leakByEngineKey[engineKey] ?? 0) + amount;
      for (const n of names) {
        if (n && agg.exampleResources.length < 5 && !agg.exampleResources.includes(n)) {
          agg.exampleResources.push(n);
        }
      }
    });

    // 4. Build action items with priority score (totalRevenueImpact / effortWeight). Do not sort list here.
    const list: ActionItem[] = [];
    byAction.forEach((agg, actionGroupKey) => {
      const primaryEngineKey =
        Object.entries(agg.leakByEngineKey).sort((a, b) => b[1] - a[1])[0]?.[0] ?? actionGroupKey;
      const totalLeakForMetric = resolveLeakForMetricDrawer(primaryEngineKey, leakByMetric) || 1;
      const weight = totalLeakForMetric > 0 ? agg.totalRevenueImpact / totalLeakForMetric : 0;
      const primaryMetricKey =
        metricsForDashboard.find((m) => metricKeyToEngineKey(m.metricKey) === primaryEngineKey)?.metricKey ?? null;
      const effort = getEffortForGroup(actionGroupKey, agg.resourceCount);
      const effortWeight = getEffortWeight(effort);
      const priorityScore = effortWeight > 0 ? agg.totalRevenueImpact / effortWeight : 0;

      list.push({
        actionGroupKey,
        businessProblem: getBusinessProblem(actionGroupKey),
        recommendedAction: getRecommendedActionForGroup(actionGroupKey),
        totalRevenueImpact: agg.totalRevenueImpact,
        priorityLevel: priorityFromDollars(agg.totalRevenueImpact),
        resourceCount: agg.resourceCount,
        exampleResources: [...agg.exampleResources].slice(0, 5),
        primaryEngineKey,
        primaryMetricKey,
        confidence: confidenceFromWeight(weight),
        metricLabel: getMetricShortLabel(primaryEngineKey),
        causeLabel: getCauseLabel(actionGroupKey),
        businessTitle: getBusinessTitle(actionGroupKey),
        effort,
        expectedImprovement: getExpectedImprovementForMetric(primaryEngineKey),
        priorityScore,
        effortWeight,
        leakByEngineKey: { ...agg.leakByEngineKey },
      });
    });

    const rawRevenue = list
      .filter((f) => f.totalRevenueImpact > 0 && f.totalRevenueImpact >= MIN_REVENUE_FOR_PRIORITY_FIX)
      .sort((a, b) => b.totalRevenueImpact - a.totalRevenueImpact);

    const rawAttributedSum = rawRevenue.reduce((s, f) => s + f.totalRevenueImpact, 0);
    const totalLossBaseline =
      typeof estimatedMonthlyLeak === "number" && Number.isFinite(estimatedMonthlyLeak) && estimatedMonthlyLeak > 0
        ? estimatedMonthlyLeak
        : rawAttributedSum;

    const revenueFixesScaled = scaleFixesToTotalLoss(
      rawRevenue,
      totalLossBaseline > 0 ? totalLossBaseline : undefined
    ).filter((f) => f.totalRevenueImpact >= MIN_REVENUE_FOR_PRIORITY_FIX);

    const stageW = computeStageMetricWeights(revenueStageSnapshot ?? null);
    const revenueFixes = [...revenueFixesScaled].sort((a, b) => comparePriorityFixes(a, b, stageW));

    const optimizationFixes = list
      .filter((f) => f.totalRevenueImpact === 0 || f.totalRevenueImpact < MIN_REVENUE_FOR_PRIORITY_FIX)
      .sort((a, b) => b.totalRevenueImpact - a.totalRevenueImpact || a.effortWeight - b.effortWeight);

    const recoverUpTo = revenueFixes.reduce((s, a) => s + a.totalRevenueImpact, 0);
    const deeperRemainingLoss = Math.max(0, roundMoney(totalLossBaseline - rawAttributedSum));

    return {
      revenueFixes,
      optimizationFixes,
      recoverUpTo,
      totalLossBaseline,
      deeperRemainingLoss,
    };
  }, [leakByMetric, metricsForDashboard, estimatedMonthlyLeak, revenueStageSnapshot]);

  const hasAnyFixes = revenueFixes.length > 0 || optimizationFixes.length > 0;
  const totalFixCount = revenueFixes.length;
  const totalLoss = totalLossBaseline;

  // No actions: same for free and Pro
  if (!hasAnyFixes) {
    return (
      <div className="ui-panel ui-panel--muted overflow-hidden">
        <div className="border-b border-white/10 bg-white/5 px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Priority Fixes</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-[var(--muted)]">
            No prioritized actions for this run. Improve metric scores to see optimization opportunities.
          </p>
        </div>
      </div>
    );
  }

  // Free tier: blurred preview only; do not leak full priority details or revenue
  if (!isProUser) {
    const visibleActions = revenueFixes.slice(0, TOP_EXPANDED_FIXES);
    const lockedCount = Math.max(0, revenueFixes.length - TOP_EXPANDED_FIXES);
    const nVisibleFree = Math.min(TOP_EXPANDED_FIXES, totalFixCount);
    const visibleRecoveryFree = revenueFixes
      .slice(0, nVisibleFree)
      .reduce((s, f) => s + f.totalRevenueImpact, 0);
    const mAdditionalFree = Math.max(0, totalFixCount - nVisibleFree);
    const headerYPctFree =
      totalLoss > 0 ? Math.min(100, Math.round((visibleRecoveryFree / totalLoss) * 100)) : 0;
    const zRemainingFree = Math.max(0, roundMoney(totalLoss - visibleRecoveryFree));

    return (
      <div className="ui-panel ui-panel--muted overflow-hidden">
        <div className="border-b border-white/10 bg-white/5 px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Priority Fixes</h2>
          {totalFixCount > 0 ? (
            <>
              <p className="text-sm text-[var(--foreground)] mt-1 font-medium tabular-nums">
                Recover {formatCurrency(visibleRecoveryFree)}/month from top {nVisibleFree} fix
                {nVisibleFree === 1 ? "" : "es"} ({headerYPctFree}% of total loss)
              </p>
              {mAdditionalFree > 0 ? (
                <p className="text-xs text-[var(--muted)] mt-1.5 leading-snug">
                  We found {mAdditionalFree} additional issue
                  {mAdditionalFree === 1 ? "" : "s"} affecting performance ({totalFixCount} total).
                </p>
              ) : (
                <p className="text-xs text-[var(--muted)] mt-1.5">{totalFixCount} prioritized fix{totalFixCount === 1 ? "" : "es"}.</p>
              )}
              {zRemainingFree > 0.005 ? (
                <p className="text-xs text-[var(--foreground)] mt-1.5 font-medium">
                  Unlock full analysis to recover remaining {formatCurrency(zRemainingFree)}/month
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--muted)] mt-1">
              No revenue-ranked fixes this run. See additional optimizations below.
            </p>
          )}
        </div>
        <div className="p-6">
          <div className="space-y-4 mb-4">
            {visibleActions.map((item, idx) => (
              <div
                key={`${item.actionGroupKey}-${idx}`}
                className="rounded-lg border border-white/[0.06] bg-white/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-lg font-bold text-[var(--muted)]">#{idx + 1}</span>
                  <h3 className="font-semibold text-sm text-[var(--foreground)] flex-1">
                    {item.businessTitle}
                  </h3>
                  <span
                    className={`shrink-0 inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      item.priorityLevel === "High"
                        ? "bg-red-500/20 text-red-400"
                        : item.priorityLevel === "Medium"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-white/10 text-[var(--muted)]"
                    }`}
                  >
                    {item.priorityLevel}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {lockedCount > 0 && (
            <>
              <p className="text-xs font-medium text-[var(--muted)] mb-2" aria-live="polite">
                {lockedCount} more prioritized fix{lockedCount === 1 ? "" : "es"} hidden — upgrade to see full detail.
              </p>
              <div className="blur-[6px] select-none pointer-events-none space-y-4 mb-4">
                {revenueFixes.slice(TOP_EXPANDED_FIXES).map((item, idx) => (
                  <div
                    key={`locked-${item.actionGroupKey}-${idx}`}
                    className="rounded-lg border border-white/[0.06] bg-white/5 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-[var(--muted)]">#{idx + 3}</span>
                      <h3 className="font-semibold text-sm">{item.businessTitle}</h3>
                    </div>
                  </div>
                ))}
              </div>
              <div className="relative z-10 rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/10 p-6 text-center">
                <h3 className="text-base font-semibold text-[var(--foreground)]">
                  Unlock full analysis
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  See all {totalFixCount} prioritized fixes, fix guides, and recovery detail.
                </p>
                <button
                  type="button"
                  onClick={onDemoUpgrade}
                  className="relative z-10 mt-4 rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#befe34]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                >
                  Upgrade to Pro
                </button>
              </div>
            </>
          )}

          {lockedCount === 0 && (
            <div className="relative z-10 rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/10 p-6 text-center">
              <h3 className="text-base font-semibold text-[var(--foreground)]">
                Unlock full analysis
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Open fix guides and full financial detail for every metric.
              </p>
              <button
                type="button"
                onClick={onDemoUpgrade}
                className="relative z-10 mt-4 rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium hover:opacity-90"
              >
                Upgrade to Pro
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pro tier: two-column cards (used for both Priority Fixes and Additional Performance Optimizations)
  function renderPriorityCard(item: ActionItem, rank: number, showRevenue: boolean) {
    const impactLabels = impactsLabelsFromLeakByEngine(item.leakByEngineKey);
    const isCollapsed =
      showRevenue && rank > TOP_EXPANDED_FIXES && !expandPastTop[item.actionGroupKey];

    const groupedLabels = item.exampleResources.map((name) => getResourceGroupLabel(null, name));
    const uniqueGrouped = [...new Set(groupedLabels)];
    const effortCopy =
      item.effort === "Low"
        ? "Low (<1 hour)"
        : item.effort === "Medium"
          ? "Medium (1–2 hours)"
          : "High (half day+)";
    const fixGuideHref = projectId && item.primaryMetricKey
      ? `/dashboard/${projectId}?metric=${item.primaryMetricKey}&tab=forensic`
      : projectId
        ? `/dashboard/${projectId}?tab=forensic`
        : null;

    if (isCollapsed) {
      return (
        <div
          key={`${item.actionGroupKey}-${rank}`}
          className="ui-panel ui-panel--muted rounded-lg p-4 flex flex-wrap items-start justify-between gap-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-lg font-bold tabular-nums text-[var(--foreground)]">#{rank}</span>
              <h3 className="font-semibold text-[var(--foreground)] text-sm sm:text-base">{item.businessTitle}</h3>
            </div>
            <p className="text-xs text-[var(--muted)] mt-1.5 leading-snug">
              <span className="font-semibold text-[var(--foreground)]">Impacts: </span>
              {impactLabels.length > 0 ? impactLabels.join(", ") : "—"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold tabular-nums text-[var(--accent)]">{formatCurrency(item.totalRevenueImpact)}/mo</p>
            <button
              type="button"
              onClick={() => setExpandPastTop((p) => ({ ...p, [item.actionGroupKey]: true }))}
              className="mt-1 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Expand
            </button>
          </div>
        </div>
      );
    }

    return (
      <article
        key={`${item.actionGroupKey}-${rank}`}
        className="ui-panel ui-panel--muted rounded-lg overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row min-h-0">
          {/* LEFT: problem context */}
          <div className="flex-1 p-5 space-y-3 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tabular-nums text-[var(--foreground)]">#{rank}</span>
              <h3 className="font-semibold text-[var(--foreground)]">{item.businessTitle}</h3>
            </div>
            <p className="text-xs text-[var(--muted)] leading-snug">
              <span className="font-semibold text-[var(--foreground)]">Impacts: </span>
              {impactLabels.length > 0 ? impactLabels.join(", ") : "—"}
            </p>
            <p className="text-sm text-[var(--muted)] leading-snug">
              {getImpactExplanation(item.actionGroupKey)}
            </p>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Recommended fix
              </p>
              <p className="text-sm text-[var(--foreground)] mt-0.5 leading-snug">
                {item.recommendedAction}
              </p>
            </div>
            {uniqueGrouped.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Example affected resources
                </p>
                <p className="text-sm text-[var(--foreground)] mt-0.5">
                  {uniqueGrouped.join(" · ")}
                </p>
              </div>
            )}
            {fixGuideHref && (
              <div className="pt-2">
                <Link
                  href={fixGuideHref}
                  className="inline-flex rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#befe34]/50"
                >
                  Open Fix Guide
                </Link>
              </div>
            )}
          </div>

          {/* RIGHT: decision signals */}
          <div className="sm:w-44 shrink-0 border-t sm:border-t-0 sm:border-l border-white/10 bg-white/[0.04] p-5 flex flex-col justify-center gap-4">
            <div>
              {showRevenue ? (
                <>
                  <p className="text-2xl font-bold tabular-nums text-[var(--accent)]">
                    {formatCurrency(item.totalRevenueImpact)}/mo
                  </p>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)] mt-0.5">
                    Potential recovery
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-[var(--muted)]">—</p>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)] mt-0.5">
                    Performance improvement
                  </p>
                </>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Effort estimate
              </p>
              <p className="text-sm font-medium text-[var(--foreground)] mt-0.5">{effortCopy}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Confidence level
              </p>
              <p className="text-sm font-medium text-[var(--foreground)] mt-0.5">{item.confidence}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Impacts
              </p>
              <p className="text-sm font-medium text-[var(--foreground)] mt-0.5 leading-snug">
                {impactLabels.length > 0 ? impactLabels.join(", ") : getMetricBadgeCode(item.primaryEngineKey)}
              </p>
            </div>
          </div>
        </div>
      </article>
    );
  }

  const nVisiblePro = totalFixCount;
  const visibleRecoveryPro = recoverUpTo;
  const headerYPctPro =
    totalLoss > 0 ? Math.min(100, Math.round((visibleRecoveryPro / totalLoss) * 100)) : 0;

  return (
    <div className="ui-panel ui-panel--muted overflow-hidden">
      {/* Priority Fixes: revenue-impact only */}
      {revenueFixes.length > 0 && (
        <>
          <div className="border-b border-white/10 bg-white/5 px-6 py-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Priority Fixes</h2>
            <p className="mt-1 text-base font-medium tabular-nums text-[var(--accent)]">
              Recover {formatCurrency(visibleRecoveryPro)}/month from top {nVisiblePro} fix
              {nVisiblePro === 1 ? "" : "es"} ({headerYPctPro}% of total loss)
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {totalFixCount} prioritized fix{totalFixCount === 1 ? "" : "es"} — sorted by revenue impact (highest first).
            </p>
            {deeperRemainingLoss > 0.5 ? (
              <p className="mt-1 text-sm text-[var(--muted)]">
                Remaining {formatCurrency(deeperRemainingLoss)}/month has no resource-level trace in this run — treat as deeper
                fixes.
              </p>
            ) : null}
          </div>
          <div className="p-6 space-y-4">
            {revenueFixes
              .filter((item) => item.totalRevenueImpact > 0)
              .map((item, idx) => renderPriorityCard(item, idx + 1, true))}
          </div>
        </>
      )}

      {/* Additional Performance Optimizations: no measurable revenue */}
      {optimizationFixes.length > 0 && (
        <>
          <div className={`border-b border-white/10 bg-white/5 px-6 py-4 ${revenueFixes.length > 0 ? "border-t border-white/10" : ""}`}>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Additional Performance Optimizations</h2>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              Useful improvements with no measurable revenue recovery.
            </p>
          </div>
          <div className="p-6 space-y-4">
            {optimizationFixes.map((item, idx) => renderPriorityCard(item, idx + 1, false))}
          </div>
        </>
      )}
    </div>
  );
}
