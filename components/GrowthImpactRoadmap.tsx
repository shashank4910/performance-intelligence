"use client";

import { useState, useMemo } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import {
  computeImpactIndex,
  riskBreakdownToDomainScores,
  type DomainName,
  type DomainScores,
} from "@/lib/impactIndexEngine";
import { applyCompetitiveMultiplier, type CompetitorDomainScores } from "@/lib/competitiveMultiplier";
import { riskMetricMap } from "@/lib/riskMetricMap";
import {
  generateSimpleRecommendation,
  type ResourceContext,
} from "@/lib/recommendationEngine";
import {
  computeResourceImpacts,
  buildResourceImpactExplanation,
  type ResourceForImpact,
} from "@/lib/resourceImpactEngine";

const METRIC_LABELS: Record<string, string> = {
  lcp: "LCP",
  ttfb: "TTFB",
  fcp: "FCP",
  speedIndex: "Speed Index",
  cls: "CLS",
  inp: "INP",
  tti: "TTI",
  tbt: "TBT",
  "server-response-time": "TTFB",
};

type RiskBreakdown = {
  speed_risk_score?: number;
  speed_risk_level?: string;
  ux_risk_score?: number;
  ux_risk_level?: string;
  seo_risk_score?: number;
  seo_risk_level?: string;
  conversion_risk_score?: number;
  conversion_risk_level?: string;
  scaling_risk_score?: number;
  scaling_risk_level?: string;
};

type FixPriority = { category: string; score: number; priority: "High" | "Medium" | "Low" };

export type GrowthImpactRoadmapProps = {
  riskBreakdown: RiskBreakdown | null | undefined;
  fixPriorities?: FixPriority[];
  competitorScores?: CompetitorDomainScores | null;
  resourceContextByDomain?: Partial<Record<DomainName, ResourceContext>> | null;
  resourcesByDomain?: Partial<Record<DomainName, ResourceForImpact[]>> | null;
  /** When true, omit the built-in title blurb (parent already provides a section header). */
  embedded?: boolean;
};

function domainLabel(domain: string): string {
  const d = domain.toLowerCase();
  if (d === "speed") return "Speed";
  if (d === "ux") return "UX";
  if (d === "seo") return "SEO";
  if (d === "conversion") return "Conversion";
  if (d === "scaling") return "Scaling";
  return domain;
}

const DOMAIN_TO_LEVEL_KEY: Record<string, keyof RiskBreakdown> = {
  speed: "speed_risk_level",
  ux: "ux_risk_level",
  seo: "seo_risk_level",
  conversion: "conversion_risk_level",
  scaling: "scaling_risk_level",
};

function getRiskLevel(domain: string, breakdown: RiskBreakdown | null | undefined): string {
  if (!breakdown) return "—";
  const levelKey = DOMAIN_TO_LEVEL_KEY[domain.toLowerCase()];
  const level = levelKey ? breakdown[levelKey] : undefined;
  return typeof level === "string" ? level : "—";
}

function getComplexity(domain: string, fixPriorities: FixPriority[] | undefined): "Low" | "Medium" | "High" {
  const cat = domain.toLowerCase();
  const fp = fixPriorities?.find((f) => f.category.toLowerCase() === cat);
  if (fp?.priority) return fp.priority;
  return "Medium";
}

function buildExplanation(params: {
  domainName: string;
  riskLabel: string;
  impactIndex: number;
  topMetrics: string[];
  competitiveGap: number | null;
}): string {
  const { domainName, riskLabel, impactIndex, topMetrics, competitiveGap } = params;
  const metricsLine = topMetrics.length ? topMetrics.slice(0, 3).map((m) => METRIC_LABELS[m] || m).join(", ") : "key metrics";
  if (competitiveGap != null && competitiveGap < 0) {
    return `${domainName} (${riskLabel}) has high growth impact (${impactIndex}) and is influenced by ${metricsLine}. Improving this area will help close the gap with competitors and strengthen user experience.`;
  }
  return `${domainName} (${riskLabel}) drives ${impactIndex}% of your growth impact and is tied to ${metricsLine}. Addressing it improves both user perception and core performance signals.`;
}

function getStrategicRecommendation(domain: string, complexity: string): string {
  if (complexity === "High") return "Tackle first; highest leverage for overall health.";
  if (complexity === "Medium") return "Plan in next sprint; measurable impact on metrics.";
  return "Optimize when capacity allows; contributes to long-term stability.";
}

function defaultResourceContextForDomain(domain: DomainName, topMetrics: string[]): ResourceContext {
  const metricImpact = topMetrics.slice(0, 3).map((m) => (m === "lcp" ? "LCP" : m === "inp" ? "INP" : m === "ttfb" ? "TTFB" : m === "cls" ? "CLS" : m));
  return {
    resourceName: `${domain}-related resources`,
    domain,
    queueTime: 350,
    blockingTime: 180,
    criticalPath: false,
    size: 200000,
    metricImpact: metricImpact.length ? metricImpact : ["LCP", "INP"],
  };
}

function placeholderResourcesForDomain(domain: DomainName, topMetrics: string[]): ResourceForImpact[] {
  const affectedMetrics = topMetrics.slice(0, 3).map((m) => (m === "lcp" ? "LCP" : m === "inp" ? "INP" : m === "ttfb" ? "TTFB" : m === "cls" ? "CLS" : m === "tbt" ? "TBT" : m.toUpperCase()));
  return [
    {
      url: `https://example.com/${domain.toLowerCase()}-bundle.js`,
      type: "js",
      queueTime: 350,
      blockingTime: 180,
      transferSize: 200000,
      isCriticalPath: false,
      affectedMetrics: affectedMetrics.length ? affectedMetrics : ["LCP", "INP"],
    },
  ];
}

export default function GrowthImpactRoadmap({
  riskBreakdown,
  fixPriorities = [],
  competitorScores,
  resourceContextByDomain,
  resourcesByDomain,
  embedded = false,
}: GrowthImpactRoadmapProps) {
  const [expanded, setExpanded] = useState<DomainName | null>(null);
  const [technicalOpen, setTechnicalOpen] = useState<DomainName | null>(null);
  const [resourceModalDomain, setResourceModalDomain] = useState<DomainName | null>(null);

  const roadmapItems = useMemo(() => {
    const scores = riskBreakdownToDomainScores(riskBreakdown);
    const yourScores: DomainScores = {
      Speed: scores.Speed,
      UX: scores.UX,
      SEO: scores.SEO,
      Conversion: scores.Conversion,
      Scaling: scores.Scaling,
    };
    const impactIndex = computeImpactIndex(scores);
    const finalIndex = applyCompetitiveMultiplier(impactIndex, yourScores, competitorScores);
    const hasCompetitor = competitorScores && Object.keys(competitorScores).length > 0;

    const items: Array<{
      domain: DomainName;
      finalImpactIndex: number;
      riskLabel: string;
      complexity: "Low" | "Medium" | "High";
      competitiveGap: number | null;
      hasCompetitor: boolean;
      topMetrics: string[];
    }> = [];

    for (const domain of ["Speed", "UX", "SEO", "Conversion", "Scaling"] as DomainName[]) {
      const yourScore = yourScores[domain] ?? 0;
      const compScore = competitorScores?.[domain];
      const gap = compScore != null ? yourScore - compScore : null;
      const riskLabel = getRiskLevel(domain, riskBreakdown);
      const complexity = getComplexity(domain, fixPriorities);
      const topMetrics = riskMetricMap[domain] ?? [];
      items.push({
        domain,
        finalImpactIndex: finalIndex[domain] ?? 0,
        riskLabel,
        complexity,
        competitiveGap: gap,
        hasCompetitor: !!hasCompetitor,
        topMetrics,
      });
    }

    items.sort((a, b) => b.finalImpactIndex - a.finalImpactIndex);
    return items;
  }, [riskBreakdown, fixPriorities, competitorScores]);

  if (!riskBreakdown) return null;

  return (
    <div className="space-y-4">
      {!embedded ? (
        <>
          <h2 className="text-lg font-semibold text-white">Growth Impact Roadmap</h2>
          <p className="text-sm text-[var(--muted)]">
            Prioritized by impact index. Expand for contributing metrics and recommendations.
          </p>
        </>
      ) : null}
      <div className="space-y-3">
        {roadmapItems.map((item, idx) => {
          const isExpanded = expanded === item.domain;
          const urgencyGlow = item.finalImpactIndex >= 70 ? "shadow-[0_0_20px_rgba(239,68,68,0.08)]" : item.finalImpactIndex >= 50 ? "shadow-[0_0_16px_rgba(245,158,11,0.08)]" : "";
          return (
            <div
              key={item.domain}
              className={`ui-panel overflow-hidden transition-all duration-300 ${urgencyGlow}`}
              style={{
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : item.domain)}
                className="w-full text-left px-5 py-4 flex flex-wrap items-center gap-3 gap-y-2 hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-sm font-medium text-[var(--muted)] w-6">
                  {idx + 1}
                </span>
                <span className="font-medium text-[var(--foreground)] capitalize">
                  {domainLabel(item.domain)}
                </span>
                <span className="text-sm tabular-nums text-[var(--foreground)]">
                  <AnimatedNumber value={item.finalImpactIndex} /> Impact
                </span>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    item.riskLabel?.toLowerCase() === "low" || item.riskLabel?.toLowerCase() === "good"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : item.riskLabel?.toLowerCase() === "moderate" || item.riskLabel?.toLowerCase() === "needs improvement"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {item.riskLabel || "—"}
                </span>
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    item.complexity === "High"
                      ? "bg-red-500/10 text-red-400/90"
                      : item.complexity === "Medium"
                        ? "bg-amber-500/10 text-amber-400/90"
                        : "bg-white/10 text-[var(--muted)]"
                  }`}
                >
                  {item.complexity} complexity
                </span>
                {item.hasCompetitor && item.competitiveGap != null && item.competitiveGap < 0 && (
                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-cyan-500/15 text-cyan-400/90">
                    Competitive pressure
                  </span>
                )}
                <span className="ml-auto text-[var(--muted)]">
                  {isExpanded ? "▼" : "▶"}
                </span>
              </button>
              {isExpanded && (
                <div
                  className="px-5 pb-5 pt-0 border-t border-white/[0.06] growth-roadmap-expand"
                >
                  <div className="pt-4 space-y-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)] mb-1">
                        Top contributing metrics
                      </div>
                      <p className="text-sm text-[var(--foreground)]">
                        {item.topMetrics.slice(0, 3).map((m) => METRIC_LABELS[m] || m).join(", ")}
                      </p>
                    </div>
                    {(() => {
                      const ctx = resourceContextByDomain?.[item.domain] ?? defaultResourceContextForDomain(item.domain, item.topMetrics);
                      const rec = generateSimpleRecommendation(ctx);
                      const urgencyBorder = item.finalImpactIndex >= 70 ? "border-l-cyan-500/50" : item.finalImpactIndex >= 50 ? "border-l-amber-500/40" : "border-l-white/10";
                      return (
                        <div className={`rounded-lg border border-white/[0.06] bg-white/[0.02] pl-4 border-l-2 ${urgencyBorder} growth-roadmap-expand`}>
                          <div className="py-3 pr-4 space-y-2">
                            <div className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                              Recommendation
                            </div>
                            <p className="font-semibold text-sm text-[var(--foreground)]">
                              {rec.action}
                            </p>
                            <p className="text-sm text-[var(--muted)] leading-relaxed">
                              {rec.why}
                            </p>
                            <p className="text-sm font-semibold text-[var(--foreground)]">
                              {rec.impact}
                            </p>
                            {rec.technicalDetails.length > 0 && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => setTechnicalOpen(technicalOpen === item.domain ? null : item.domain)}
                                  className="text-xs font-medium text-[var(--accent)] hover:underline flex items-center gap-1"
                                >
                                  {technicalOpen === item.domain ? "Hide Technical Details ▲" : "Show Technical Details ▼"}
                                </button>
                                {technicalOpen === item.domain && (
                                  <ul className="mt-2 space-y-1 text-xs text-[var(--muted)] list-disc list-inside growth-roadmap-expand">
                                    {rec.technicalDetails.map((t, i) => (
                                      <li key={i}>{t}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    {(() => {
                      const domainResources = resourcesByDomain?.[item.domain] ?? placeholderResourcesForDomain(item.domain, item.topMetrics);
                      const impactResults = computeResourceImpacts(domainResources);
                      const count = impactResults.length;
                      return (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setResourceModalDomain(item.domain)}
                            className="text-xs font-medium text-[var(--accent)] hover:underline flex items-center gap-1"
                          >
                            View All Contributing Resources ({count})
                          </button>
                        </div>
                      );
                    })()}
                    <p className="text-sm text-[var(--muted)] leading-relaxed">
                      {buildExplanation({
                        domainName: domainLabel(item.domain),
                        riskLabel: item.riskLabel,
                        impactIndex: item.finalImpactIndex,
                        topMetrics: item.topMetrics,
                        competitiveGap: item.competitiveGap,
                      })}
                    </p>
                    <p className="text-xs font-medium text-[var(--accent)]">
                      {getStrategicRecommendation(item.domain, item.complexity)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {resourceModalDomain && (
        <ResourceImpactModal
          domain={resourceModalDomain}
          resources={resourcesByDomain?.[resourceModalDomain] ?? placeholderResourcesForDomain(resourceModalDomain, riskMetricMap[resourceModalDomain] ?? [])}
          onClose={() => setResourceModalDomain(null)}
        />
      )}
    </div>
  );
}

function ResourceImpactModal({
  domain,
  resources,
  onClose,
}: {
  domain: DomainName;
  resources: ResourceForImpact[];
  onClose: () => void;
}) {
  const results = useMemo(() => computeResourceImpacts(resources), [resources]);
  const domainDisplay = domainLabel(domain);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        style={{ animation: "growthRoadmapExpand 200ms ease-out" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-2xl max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden ui-panel shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-modal-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 id="resource-modal-title" className="text-lg font-semibold text-zinc-100">
            Contributing Resources — {domainDisplay}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-white/10 hover:text-[var(--foreground)] transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(85vh-4rem)] p-5 space-y-4">
          {results.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No contributing resources for this domain.</p>
          ) : (
            results.map((result, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-2 growth-roadmap-expand"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                    Impact {result.impactScore}
                  </span>
                  <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-[var(--muted)]">
                    {result.resource.type.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs font-mono text-[var(--muted)] truncate" title={result.resource.url}>
                  {result.resource.url}
                </p>
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  {buildResourceImpactExplanation(result)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
