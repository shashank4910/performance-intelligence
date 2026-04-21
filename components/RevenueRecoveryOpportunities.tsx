"use client";

import { useMemo, useState } from "react";
import { attributeLeakToResources, type ResourceForAttribution } from "@/lib/impactEngine/revenueLeakCalculator";
import {
  getActionTitleForResource,
  getImprovesLabelsForMetric,
  getFilenameFromUrl,
  resourceTypeFromUrl as resourceTypeFromLabelLib,
} from "@/lib/revenueRecoveryLabels";
import LockedRevenueRecovery from "@/components/LockedRevenueRecovery";

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

export type RevenueRecoveryOpportunitiesProps = {
  leakByMetric: Record<string, number>;
  metricsForDashboard?: MetricRow[] | null;
  estimatedMonthlyLeak?: number;
  isProUser?: boolean;
  onDemoUpgrade?: () => void;
};

type Opportunity = {
  issueTitle: string;
  actionTitle: string;
  filename: string;
  engineKey: string;
  metricAffected: string;
  primaryResource: { url: string | null; type: string; totalBytes: number };
  estimatedRevenueRecovery: number;
  severity: "High" | "Medium" | "Low";
  recommendedAction: string;
  whyThisMatters: string;
  estimatedImprovement: string;
};

function resourceTypeFromUrl(url: string | null): string {
  return resourceTypeFromLabelLib(url);
}

function displayResourceName(url: string | null, element: string | null): string {
  const fromUrl = getFilenameFromUrl(url) || (url && url.length > 40 ? url.slice(0, 37) + "..." : url);
  if (fromUrl) return fromUrl;
  if (element) return element.length > 40 ? element.slice(0, 37) + "..." : element;
  return "Unknown resource";
}

function getRecommendationCopy(
  resourceType: string,
  engineKey: string,
  displayValue: string
): { why: string; action: string; improvement: string } {
  const t = resourceType.toLowerCase();
  const k = engineKey.toLowerCase();
  const metricShort =
    k === "lcp" ? "LCP" : k === "tti" ? "TTI" : k === "tbt" ? "TBT" : k === "cls" ? "CLS" : k === "fcp" ? "FCP" : k === "speedindex" ? "Speed Index" : k === "mainthread" ? "Main Thread" : k === "bootuptime" ? "Bootup Time" : k === "unusedjs" ? "Unused JS" : k === "unusedcss" ? "Unused CSS" : k === "ttfb" ? "TTFB" : engineKey;

  if (t === "font") {
    const why = "This font blocks rendering or causes layout shift, delaying when users see stable content.";
    const action = "Use font-display: swap or optional and preload only the critical font. Subset fonts to reduce size.";
    return { why, action, improvement: `Faster first paint and more stable ${metricShort}.` };
  }
  if (t === "javascript") {
    if (k === "tti" || k === "tbt" || k === "mainthread" || k === "bootuptime") {
      return {
        why: "This script blocks the main thread during page startup, preventing users from interacting with the site quickly.",
        action: "Lazy-load this script after the first user interaction or split the bundle using route-based code splitting. Defer non-critical scripts.",
        improvement: `~${displayValue} faster Time to Interactive / less blocking time.`,
      };
    }
    if (k === "lcp" || k === "fcp" || k === "speedindex") {
      return {
        why: "This script runs before the main content paints, delaying when users see the page.",
        action: "Defer or async-load this script so it does not block the critical rendering path. Move below-the-fold logic to a separate chunk.",
        improvement: `~${displayValue} faster ${metricShort}.`,
      };
    }
    if (k === "unusedjs") {
      return {
        why: "This JavaScript is loaded but not used on the page, increasing payload and parse cost.",
        action: "Remove the unused module or use code-splitting so it loads only on routes that need it. Run a bundle analyzer to find dead code.",
        improvement: "Smaller payload and faster parse time.",
      };
    }
    return {
      why: "This script contributes to main thread work and delays interactivity.",
      action: "Defer loading or split the bundle using code splitting. Consider web workers for heavy computation.",
      improvement: `Faster ${metricShort}.`,
    };
  }
  if (t === "css") {
    if (k === "lcp" || k === "fcp" || k === "speedindex") {
      return {
        why: "This stylesheet blocks rendering so the browser waits before painting content.",
        action: "Inline critical above-the-fold CSS and defer this file with media=\"print\" then swap to all. Or load it asynchronously.",
        improvement: `~${displayValue} faster ${metricShort}.`,
      };
    }
    if (k === "unusedcss") {
      return {
        why: "This CSS is loaded but not used, adding payload and render cost.",
        action: "Remove unused rules or split by route. Use PurgeCSS or similar to eliminate dead CSS.",
        improvement: "Smaller payload and faster style resolution.",
      };
    }
    return {
      why: "This stylesheet blocks the critical rendering path.",
      action: "Inline critical CSS and defer non-critical styles. Use media=\"print\" trick for async loading.",
      improvement: `Faster ${metricShort}.`,
    };
  }
  if (t === "image") {
    return {
      why: "This image delays the largest contentful paint or causes layout shift when it loads.",
      action: "Use next-gen formats (WebP/AVIF), add explicit width/height to prevent CLS, and preload the LCP image. Prefer responsive images with srcset.",
      improvement: `~${displayValue} faster LCP and more stable layout.`,
    };
  }
  if (t === "third-party") {
    return {
      why: "Third-party scripts often block the main thread and delay interactivity.",
      action: "Load the script asynchronously or after user interaction. Use a tag manager with delay or load in a web worker if possible.",
      improvement: `Reduced blocking time and faster ${metricShort}.`,
    };
  }

  return {
    why: `This resource affects ${metricShort} and contributes to revenue leak.`,
    action: "Optimize load order and size. Defer non-critical resources and ensure critical path is minimal.",
    improvement: `Improved ${metricShort}.`,
  };
}

function severityFromDollars(amount: number): "High" | "Medium" | "Low" {
  if (amount >= 500) return "High";
  if (amount >= 100) return "Medium";
  return "Low";
}

function metricKeyToEngineKey(metricKey: string): string {
  const parts = metricKey.split("-");
  return parts.slice(1).join("-") || metricKey;
}

export default function RevenueRecoveryOpportunities({
  leakByMetric,
  metricsForDashboard,
  isProUser = false,
  onDemoUpgrade,
}: RevenueRecoveryOpportunitiesProps) {
  const opportunities = useMemo(() => {
    if (!leakByMetric || typeof leakByMetric !== "object" || !metricsForDashboard?.length) return [];
    const list: Opportunity[] = [];

    for (const row of metricsForDashboard) {
      const engineKey = metricKeyToEngineKey(row.metricKey);
      const leak = leakByMetric[engineKey];
      if (leak == null || !row.resources?.length) continue;

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
        if (amount < 0) return;
        const type = resourceTypeFromUrl(res.url);
        const displayName = displayResourceName(res.url, res.element);
        const actionTitle = getActionTitleForResource(res.url, engineKey, type);
        const filename = getFilenameFromUrl(res.url) || displayName;
        const { why, action, improvement } = getRecommendationCopy(type, engineKey, row.displayValue);
        list.push({
          issueTitle: displayName,
          actionTitle,
          filename,
          engineKey,
          metricAffected: row.label,
          primaryResource: { url: res.url, type, totalBytes: res.totalBytes || res.wastedBytes || 0 },
          estimatedRevenueRecovery: amount,
          severity: severityFromDollars(amount),
          recommendedAction: action,
          whyThisMatters: why,
          estimatedImprovement: improvement,
        });
      });
    }

    list.sort((a, b) => b.estimatedRevenueRecovery - a.estimatedRevenueRecovery);
    return list.slice(0, 5);
  }, [leakByMetric, metricsForDashboard]);

  const [expanded, setExpanded] = useState(false);

  if (opportunities.length === 0 && isProUser) {
    return (
      <section className="scroll-mt-8">
        <h2 className="text-lg font-semibold text-white">Revenue Recovery Opportunities</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          No revenue leak attributed to specific resources for this run. Improve metric scores to see prioritized recovery opportunities.
        </p>
      </section>
    );
  }

  if (opportunities.length === 0 && !isProUser) {
    return (
      <section className="scroll-mt-8">
        <LockedRevenueRecovery previewOpportunities={[]} onUpgradeClick={onDemoUpgrade} />
      </section>
    );
  }

  const visibleItems = isProUser ? opportunities : opportunities.slice(0, 2);
  const blurredItems = isProUser ? [] : opportunities.slice(2);

  function renderCard(opp: Opportunity, idx: number, options: { showImproves: boolean; showDescription: boolean }) {
    const improvesLabels = getImprovesLabelsForMetric(opp.engineKey);
    const hasRevenue = typeof opp.estimatedRevenueRecovery === "number" && opp.estimatedRevenueRecovery > 0;
    return (
      <div
        key={`${opp.issueTitle}-${opp.metricAffected}-${idx}`}
        className="ui-panel p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              Fix #{idx + 1}
            </span>
            <h3 className="mt-1 font-semibold text-[var(--foreground)]">{opp.actionTitle}</h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">{opp.filename}</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">{opp.metricAffected}</p>
            {options.showImproves && improvesLabels.length > 0 && (
              <div className="mt-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Improves</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {improvesLabels.map((l) => (
                    <span
                      key={l}
                      className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-[var(--foreground)]"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="shrink-0 rounded-lg bg-[#befe34]/15 px-3 py-2 text-right">
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Revenue Recovery Opportunity
            </div>
            {hasRevenue ? (
              <div className="text-lg font-semibold tabular-nums text-[var(--accent)]">
                ${Math.round(opp.estimatedRevenueRecovery).toLocaleString("en-US")} / month
              </div>
            ) : (
              <div className="text-sm font-medium text-[var(--muted)]">
                Revenue recovery potential
              </div>
            )}
          </div>
        </div>
        {options.showDescription && (
          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Why this matters</h4>
              <p className="mt-1 text-sm text-[var(--foreground)] leading-relaxed">{opp.whyThisMatters}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Recommended fix</h4>
              <p className="mt-1 text-sm text-[var(--foreground)] leading-relaxed">{opp.recommendedAction}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Estimated improvement</h4>
              <p className="mt-1 text-sm text-[var(--foreground)]">{opp.estimatedImprovement}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="scroll-mt-8">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="group w-full text-left ui-panel ui-panel--muted p-4 transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#befe34]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Revenue Recovery Opportunities</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Top issues ranked by recoverable revenue. Fix these first for the highest impact.
            </p>
            <span className="mt-2 inline-block text-xs text-[var(--muted)]">
              {expanded ? "Click to collapse" : "Click to expand"}
            </span>
          </div>
          <span
            className="shrink-0 mt-1 text-[var(--muted)] transition-transform duration-200 group-hover:text-[var(--foreground)]"
            aria-hidden
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={expanded ? "rotate-180" : ""}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Visible fixes: Pro = all, Free = first 2 (full content) */}
          {visibleItems.map((opp, idx) =>
            renderCard(opp, idx, { showImproves: true, showDescription: true })
          )}

          {/* Free only: remaining fixes — Fix #, Title, Revenue visible; description area soft-blurred */}
          {blurredItems.length > 0 && (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                More fixes (Pro)
              </p>
              <div className="space-y-4">
                {blurredItems.map((opp, i) => {
                  const idx = visibleItems.length + i;
                  const hasRevenue = typeof opp.estimatedRevenueRecovery === "number" && opp.estimatedRevenueRecovery > 0;
                  return (
                    <div key={`blurred-${idx}`} className="ui-panel overflow-hidden">
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                              Fix #{idx + 1}
                            </span>
                            <h3 className="mt-1 font-semibold text-[var(--foreground)]">{opp.actionTitle}</h3>
                            <p className="text-xs text-[var(--muted)] mt-0.5">{opp.filename}</p>
                            <p className="text-xs text-[var(--muted)] mt-0.5">{opp.metricAffected}</p>
                          </div>
                          <div className="shrink-0 rounded-lg bg-[#befe34]/15 px-3 py-2 text-right">
                            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
                              Revenue Recovery Opportunity
                            </div>
                            {hasRevenue ? (
                              <div className="text-lg font-semibold tabular-nums text-[var(--accent)]">
                                ${Math.round(opp.estimatedRevenueRecovery).toLocaleString("en-US")} / month
                              </div>
                            ) : (
                              <div className="text-sm font-medium text-[var(--muted)]">
                                Revenue recovery potential
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="blur-[6px] select-none pointer-events-none border-t border-white/10">
                        <div className="p-5 pt-2 space-y-3">
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Why this matters</h4>
                            <p className="mt-1 text-sm text-[var(--foreground)] leading-relaxed">{opp.whyThisMatters}</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Recommended fix</h4>
                            <p className="mt-1 text-sm text-[var(--foreground)] leading-relaxed">{opp.recommendedAction}</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Estimated improvement</h4>
                            <p className="mt-1 text-sm text-[var(--foreground)]">{opp.estimatedImprovement}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-xl border border-[#befe34]/30 bg-[#befe34]/10 p-6 text-center shadow-[0_0_40px_var(--glow)]">
                <h3 className="text-base font-semibold text-[var(--foreground)]">
                  Unlock Performance Intelligence
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  See exactly which fixes recover revenue.
                </p>
                <button
                  type="button"
                  onClick={onDemoUpgrade}
                  className="mt-4 rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#befe34]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                >
                  Upgrade to Pro
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
