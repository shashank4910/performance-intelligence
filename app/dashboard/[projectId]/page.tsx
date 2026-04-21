"use client";

/**
 * Dashboard — full single-page layout.
 *
 * Renders every major surface inline (severity hero, revenue exposure, impact
 * breakdown, revenue impact, metrics dashboard, revenue stability,
 * competitive position, growth roadmap, priority fixes) so the user has the
 * complete picture on one scrollable page. All surfaces read the same
 * StoredProject cache via `useStoredProject` so no section recomputes values.
 */

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import RevenueExposureMeter from "@/components/RevenueExposureMeter";
import { useDashboardNav } from "@/context/DashboardNavContext";
import RefineRevenueModal from "@/components/RefineRevenueModal";
import ActionPriorityAccordion from "@/components/ActionPriorityAccordion";
import { ExecutiveSummaryCaption } from "@/components/ExecutiveSummaryCaption";
import { WebsiteHealthCard } from "@/components/dashboard/WebsiteHealthCard";
import DetailedMetricsBoard, { type MetricForDashboard as DashboardMetricForDashboard } from "@/components/DetailedMetricsBoard";
import RevenueImpactCard from "@/components/RevenueImpactCard";
import { RevenueStabilityMonitoring } from "@/components/RevenueStabilityMonitoring";
import GrowthImpactRoadmap from "@/components/GrowthImpactRoadmap";
import CompetitivePositionPanel from "@/components/dashboard/CompetitivePositionPanel";
import { computeBaselineRevenue } from "@/lib/impactEngine/businessModelRegistry";
import {
  behaviorMetricsMsFromLighthouseAudits,
  computeHeadlineRevenueLeak,
} from "@/lib/headlineRevenueLeak";
import { revenueStageSnapshotFromAnalyzeData } from "@/lib/revenueStageDistribution";
import { pickRevenueExposureCardCopy, type PhraseSeverity } from "@/lib/competitorPhrasePools";
import { scrollToMetric } from "@/lib/scrollToMetric";
import { riskMetricMap } from "@/lib/riskMetricMap";
import {
  useStoredProject,
  overallHealth100,
  type FixPriority,
  type RiskBreakdown,
  type StoredProject,
} from "@/lib/dashboardProject";

/** Visible anchors in render order; used for scroll-spy + sidebar sync. */
const SECTION_IDS = [
  "dashboard",
  "executive-summary",
  "revenue-exposure",
  "impact-breakdown",
  "metrics-responsible",
  "revenue-impact",
  "revenue-stability",
  "competitive-intelligence",
  "growth-impact-roadmap",
  "action-priority-list",
];

const DASH_SURFACE =
  "rounded-2xl border border-white/[0.08] bg-[#131b2e]/75 shadow-[0_0_0_1px_rgba(57,255,20,0.04),0_24px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl ring-1 ring-white/[0.03]";

const DASH_HERO_FEATURED =
  "rounded-2xl border-2 border-[#39FF14]/40 bg-[#131b2e]/85 shadow-[0_0_0_1px_rgba(57,255,20,0.06),0_24px_56px_rgba(0,0,0,0.5),0_0_40px_-8px_rgba(57,255,20,0.18)] backdrop-blur-xl ring-1 ring-[#39FF14]/20";

// ----- Impact Breakdown (business-readable rewrite of Risk Breakdown) -------

type ImpactSeverity = "high" | "moderate" | "low";

function classifyImpactSeverity(level: string | undefined): ImpactSeverity {
  if (!level) return "low";
  const l = level.toLowerCase();
  if (l === "low" || l === "good") return "low";
  if (l === "moderate" || l === "medium" || l === "needs improvement") return "moderate";
  return "high";
}

function impactLabelForSeverity(severity: ImpactSeverity): string {
  if (severity === "high") return "High revenue risk";
  if (severity === "moderate") return "Moderate impact";
  return "Low impact";
}

function impactBadgeClass(severity: ImpactSeverity): string {
  if (severity === "high") return "bg-red-500/15 text-red-300 ring-1 ring-red-500/25";
  if (severity === "moderate") return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25";
  return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25";
}

type ImpactCategoryKey =
  | "loadExperience"
  | "interaction"
  | "searchVisibility"
  | "conversion"
  | "scaling";

const IMPACT_EXPLANATIONS: Record<ImpactCategoryKey, Record<ImpactSeverity, string>> = {
  loadExperience: {
    high: "Users are dropping before the page fully loads, reducing initial engagement.",
    moderate: "Some users wait longer than they should for your page to load, weakening early engagement.",
    low: "Your page loads fast enough that initial impressions stay intact.",
  },
  interaction: {
    high: "Delays during taps and scrolling are reducing user engagement.",
    moderate: "Occasional lag during interaction is breaking flow for a portion of your users.",
    low: "Your site responds quickly to user input across typical journeys.",
  },
  searchVisibility: {
    high: "Slow rendering is hurting how search engines evaluate your site, limiting organic traffic.",
    moderate: "A few search-critical signals are weak enough to soften discoverability.",
    low: "Your site is performing well on the signals search engines prioritize.",
  },
  conversion: {
    high: "Issues during key actions are causing hesitation before completing conversion.",
    moderate: "Friction during checkout or sign-up flows is costing some conversions.",
    low: "Conversion-critical interactions are stable and trustworthy.",
  },
  scaling: {
    high: "Under heavier traffic, infrastructure strain will magnify every issue above.",
    moderate: "Parts of your stack may struggle as traffic grows, amplifying risks elsewhere.",
    low: "Your delivery and backend are steady at current load.",
  },
};

type ImpactCategoryDef = {
  key: ImpactCategoryKey;
  title: string;
  /** Domain key used to look up the first metric to scroll to in riskMetricMap. */
  riskDomain: "Speed" | "UX" | "SEO" | "Conversion" | "Scaling";
  levelKey: keyof RiskBreakdown;
};

const IMPACT_CATEGORIES: readonly ImpactCategoryDef[] = [
  { key: "loadExperience", title: "Load Experience", riskDomain: "Speed", levelKey: "speed_risk_level" },
  { key: "interaction", title: "Interaction Experience", riskDomain: "UX", levelKey: "ux_risk_level" },
  { key: "searchVisibility", title: "Search Visibility", riskDomain: "SEO", levelKey: "seo_risk_level" },
  { key: "conversion", title: "Conversion Readiness", riskDomain: "Conversion", levelKey: "conversion_risk_level" },
  { key: "scaling", title: "Scalability Risk", riskDomain: "Scaling", levelKey: "scaling_risk_level" },
] as const;

// ----- Revenue Exposure meter derivation (display-only) ---------------------

function revenueExposureMeterFromLevel(
  revenueRiskLevel: string | undefined,
  businessImpactLevel: string | undefined,
  overallHealthScore100?: number
): {
  title: string;
  meterValue: number;
  bandLabel: string;
  badgeClass: string;
  messageSeverity: PhraseSeverity;
} {
  const l = (revenueRiskLevel ?? "").toLowerCase();
  const b = (businessImpactLevel ?? "").toLowerCase();
  if (l === "critical" || b.includes("critical") || b.includes("severe")) {
    return {
      title: "Critical revenue exposure",
      meterValue: 93,
      bandLabel: "Critical",
      badgeClass: "bg-red-500/20 text-red-300",
      messageSeverity: "high",
    };
  }
  if (l === "high" || b.includes("significant")) {
    return {
      title: "High revenue exposure",
      meterValue: 72,
      bandLabel: "High",
      badgeClass: "bg-amber-500/20 text-amber-300",
      messageSeverity: "high",
    };
  }
  if (l === "moderate" || b.includes("moderate")) {
    return {
      title: "Moderate revenue exposure",
      meterValue: 46,
      bandLabel: "Medium",
      badgeClass: "bg-amber-400/25 text-amber-200",
      messageSeverity: "medium",
    };
  }
  if (l === "low" || b.includes("minimal")) {
    return {
      title: "Low revenue exposure",
      meterValue: 22,
      bandLabel: "Low",
      badgeClass: "bg-emerald-500/20 text-emerald-300",
      messageSeverity: "low",
    };
  }
  const h = overallHealthScore100 ?? 0;
  const messageSeverity: PhraseSeverity = h >= 80 ? "low" : h >= 50 ? "medium" : "high";
  const healthDrivenIndex = Math.round(100 - Math.max(0, Math.min(100, h)));
  return {
    title: "Revenue exposure",
    meterValue: healthDrivenIndex,
    bandLabel: "—",
    badgeClass: "bg-white/10 text-[var(--muted)]",
    messageSeverity,
  };
}

// ----------------------------------------------------------------------------

export default function DashboardProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { setActiveSectionId } = useDashboardNav();
  const projectId = params?.projectId as string | undefined;
  const analyzeRunKey = searchParams.get("run");
  const initialMetricParam = searchParams.get("metric");
  const initialAuditTabParam = searchParams.get("tab");

  const [stored, updateStored] = useStoredProject(projectId, analyzeRunKey);
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [demoProUnlocked, setDemoProUnlocked] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const onScroll = useCallback(() => {
    const ids = SECTION_IDS;
    const scrollY = window.scrollY + 120;
    for (let i = ids.length - 1; i >= 0; i--) {
      const el = sectionRefs.current[ids[i]];
      if (el) {
        const top = el.offsetTop;
        const height = el.offsetHeight;
        if (scrollY >= top && scrollY < top + height) {
          setActiveSectionId(ids[i]);
          return;
        }
      }
    }
    setActiveSectionId(ids[0]);
  }, [setActiveSectionId]);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll, stored]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const id = (ev as CustomEvent<{ id: string }>).detail?.id;
      if (typeof id !== "string" || id.length === 0) return;
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        onScroll();
      }, 60);
    };
    window.addEventListener("pi-dashboard-expand-section", handler as EventListener);
    return () => window.removeEventListener("pi-dashboard-expand-section", handler as EventListener);
  }, [onScroll]);

  if (stored === "loading") {
    return (
      <div className="relative min-h-[240px] overflow-x-hidden bg-[#060a14] px-8 py-16 text-[#dae2fd]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(1200px 600px at 85% -10%, rgba(57,255,20,0.07), transparent 55%), radial-gradient(900px 500px at 10% 40%, rgba(100,150,255,0.06), transparent 50%), linear-gradient(180deg, #0b1326 0%, #060a14 45%, #0b1326 100%)",
          }}
        />
        <div className="relative z-[1] flex items-center justify-center">
          <span className="text-sm text-slate-500">Loading report…</span>
        </div>
      </div>
    );
  }

  if (!stored || !stored.data) {
    return (
      <div className="relative min-h-[320px] overflow-x-hidden bg-[#060a14] px-5 py-12 text-[#dae2fd] sm:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(1200px 600px at 85% -10%, rgba(57,255,20,0.07), transparent 55%), radial-gradient(900px 500px at 10% 40%, rgba(100,150,255,0.06), transparent 50%), linear-gradient(180deg, #0b1326 0%, #060a14 45%, #0b1326 100%)",
          }}
        />
        <div className="relative z-[1] mx-auto max-w-xl">
          <h1 className="text-xl font-bold tracking-tight text-[#dae2fd]">Report not found</h1>
          <p className="mt-1 text-sm text-slate-400">
            This report may have expired or the link is invalid. Run an analysis from the home page to see your
            results.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#CCFF33] px-5 py-3 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(57,255,20,0.2)] transition hover:scale-[1.01] active:scale-[0.99]"
          >
            Analyze a site
          </Link>
        </div>
      </div>
    );
  }

  const data = stored.data;
  const summary = data.summary;
  const isProUserForStability =
    (typeof data.userPlan === "string" && data.userPlan === "pro") || demoProUnlocked;
  const revenueStageSnapshot = revenueStageSnapshotFromAnalyzeData(data);
  const executiveSummaryBannerText =
    typeof summary?.executive_summary_paragraph === "string" && summary.executive_summary_paragraph.trim().length > 0
      ? summary.executive_summary_paragraph.trim()
      : typeof summary?.executive_summary === "string" && summary.executive_summary.trim().length > 0
        ? summary.executive_summary.trim()
        : "";
  const healthScore100 = overallHealth100(stored);
  const riskBreakdown = data.risk_breakdown as RiskBreakdown | undefined;
  const exposureUi = revenueExposureMeterFromLevel(
    typeof data.revenueRiskLevel === "string" ? data.revenueRiskLevel : undefined,
    summary?.business_impact?.impact_level,
    healthScore100
  );
  const revenueExposureCopy = pickRevenueExposureCardCopy(
    (stored.url ?? "").trim() || "unknown",
    exposureUi.messageSeverity
  );

  /**
   * "View root causes" scrolls the user down to the first metric that
   * contributes to a category's risk score inside the Metrics Dashboard.
   */
  const handleViewRootCauses = (domain: ImpactCategoryDef["riskDomain"]) => {
    const metricIds = riskMetricMap[domain] ?? [];
    const firstMetric = metricIds[0];
    const metricsSection = document.getElementById("metrics-responsible");
    if (firstMetric) {
      metricsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => scrollToMetric(firstMetric), 350);
      return;
    }
    metricsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fixPriorities = Array.isArray(data.fix_priorities)
    ? (data.fix_priorities as FixPriority[])
    : [];
  const detailedMetricsData = (data.detailed_metrics ?? {}) as Record<string, unknown>;
  // Cast through the board's exported type so the `verdict` union aligns.
  // Upstream data returns the string form; the board narrows it for rendering.
  const metricsForDashboard = Array.isArray(data.metrics_for_dashboard)
    ? (data.metrics_for_dashboard as unknown as DashboardMetricForDashboard[])
    : undefined;
  const rawAudit = (data.rawAudit ?? null) as Record<string, unknown> | null;

  return (
    <div className="relative min-h-full overflow-x-hidden bg-[#060a14] pb-20 text-[#dae2fd]">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(1200px 600px at 85% -10%, rgba(57,255,20,0.07), transparent 55%), radial-gradient(900px 500px at 10% 40%, rgba(100,150,255,0.06), transparent 50%), linear-gradient(180deg, #0b1326 0%, #060a14 45%, #0b1326 100%)",
        }}
      />
      <div className="relative z-[1] mx-auto w-full max-w-[min(92rem,calc(100vw-2rem))] space-y-8 px-5 py-8 pb-16 sm:px-8 lg:px-12">
        {/* 1. Dashboard header + Executive Summary */}
        <section
          id="dashboard"
          ref={(el) => {
            sectionRefs.current.dashboard = el;
          }}
          className="scroll-mt-8"
        >
          <h1 className="text-2xl font-black tracking-tight text-[#dae2fd] sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">{stored.url}</p>

          {executiveSummaryBannerText ? (
            <section
              id="executive-summary"
              ref={(el) => {
                sectionRefs.current["executive-summary"] = el;
              }}
              className="mt-10 w-full scroll-mt-28 rounded-xl border border-white/[0.045] bg-[#070c18]/35 py-7 sm:mt-11 sm:py-9"
            >
              <div className="mx-auto w-full max-w-[min(88ch,92rem,calc(100vw-2rem))] px-3 sm:px-5 lg:px-6">
                <p className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 sm:text-left">
                  Executive summary
                </p>
                <div className="mt-5 text-center text-[1.05rem] font-normal leading-[1.8] tracking-[0.01em] text-slate-100/95 sm:text-left sm:text-[1.12rem] sm:leading-[1.82]">
                  <ExecutiveSummaryCaption text={executiveSummaryBannerText} />
                </div>
              </div>
            </section>
          ) : null}
        </section>

        {/* 2. Severity hero — Website Health + Revenue Exposure side-by-side */}
        <section
          id="revenue-exposure"
          ref={(el) => {
            sectionRefs.current["revenue-exposure"] = el;
          }}
          className="scroll-mt-8"
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-stretch lg:gap-6">
            <WebsiteHealthCard
              surfaceClassName={DASH_SURFACE}
              healthScore100={healthScore100}
              analyzedAt={stored.analyzedAt ?? null}
            />
            <div className={`${DASH_HERO_FEATURED} flex min-h-0 flex-col p-6 lg:p-7`}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-bold leading-snug tracking-tight text-[#eaefff]">
                  {exposureUi.title}
                </h2>
                <span
                  className={`shrink-0 rounded border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${exposureUi.badgeClass}`}
                >
                  {exposureUi.bandLabel}
                </span>
              </div>
              <div className="mt-1 flex flex-col">
                <div className="flex min-h-[140px] flex-col items-center justify-center py-2">
                  <div className="w-full max-w-[300px]">
                    <RevenueExposureMeter
                      severity={exposureUi.messageSeverity}
                      meterValue={exposureUi.meterValue}
                    />
                  </div>
                </div>
                <p className="text-center text-sm font-medium leading-snug text-[#eaefff] sm:text-left">
                  {revenueExposureCopy.primary}
                </p>
                <p className="mt-2 text-center text-sm leading-snug text-slate-400 sm:text-left">
                  {revenueExposureCopy.secondary}
                </p>
              </div>
              <div className="mt-6 space-y-3 border-t border-white/[0.08] pt-6">
                {projectId ? (
                  <Link
                    href={`/dashboard/${projectId}/revenue-impact`}
                    className="flex w-full items-center justify-center rounded-lg bg-[#CCFF33] px-4 py-4 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[0_0_32px_rgba(57,255,20,0.35)] transition hover:brightness-105 active:scale-[0.99]"
                  >
                    Estimate Revenue Impact
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setRefineModalOpen(true)}
                  className="w-full rounded-lg border border-transparent py-2 text-center text-sm font-semibold text-[#39FF14] transition hover:border-[#39FF14]/25 hover:bg-[#39FF14]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#39FF14]/50"
                >
                  Refine business inputs
                </button>
              </div>
            </div>
            <div className="hidden lg:block" aria-hidden="true" />
          </div>
        </section>

        {/* 3. Impact Breakdown — where performance hurts the business. */}
        {riskBreakdown ? (
          <section
            id="impact-breakdown"
            ref={(el) => {
              sectionRefs.current["impact-breakdown"] = el;
            }}
            className={`scroll-mt-8 ${DASH_SURFACE} p-5 sm:p-6`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Impact breakdown
            </div>
            <h2 className="mt-1 text-base font-semibold text-[#eaefff] sm:text-lg">
              Where performance is impacting your business
            </h2>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {IMPACT_CATEGORIES.map((category) => {
                const level = riskBreakdown[category.levelKey] as string | undefined;
                const severity = classifyImpactSeverity(level);
                const explanation = IMPACT_EXPLANATIONS[category.key][severity];
                const impactLabel = impactLabelForSeverity(severity);
                const badgeClass = impactBadgeClass(severity);
                return (
                  <div
                    key={category.key}
                    className="flex h-full flex-col rounded-lg border border-white/[0.06] bg-white/[0.03] p-4"
                  >
                    <div className="text-sm font-semibold text-[#eaefff]">{category.title}</div>
                    <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-300">{explanation}</p>
                    <div className="mt-3">
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}
                      >
                        {impactLabel}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleViewRootCauses(category.riskDomain)}
                      className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-[#39FF14]/25 bg-[#39FF14]/5 px-3 py-2 text-xs font-semibold text-[#39FF14] transition hover:border-[#39FF14]/50 hover:bg-[#39FF14]/10 hover:shadow-[0_0_14px_rgba(57,255,20,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#39FF14]/50"
                    >
                      View root causes
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* 4. Metrics Dashboard (detailed metrics + drawers) */}
        <section
          id="metrics-responsible"
          ref={(el) => {
            sectionRefs.current["metrics-responsible"] = el;
          }}
          className="scroll-mt-8"
        >
          <DetailedMetricsBoard
            data={detailedMetricsData as never}
            metricsForDashboard={metricsForDashboard}
            rawAudit={rawAudit}
            estimatedMonthlyLeak={
              typeof data.estimatedMonthlyLeak === "number" ? data.estimatedMonthlyLeak : undefined
            }
            leakByMetric={
              typeof data.leak_by_metric === "object" && data.leak_by_metric !== null
                ? (data.leak_by_metric as Record<string, number>)
                : undefined
            }
            isProUser={isProUserForStability}
            projectId={projectId ?? null}
            onDemoUpgrade={() => setDemoProUnlocked(true)}
            initialOpenMetricKey={initialMetricParam}
            initialAuditTab={initialAuditTabParam}
          />
        </section>

        {/* 5. Revenue Impact workspace card */}
        <section
          id="revenue-impact"
          ref={(el) => {
            sectionRefs.current["revenue-impact"] = el;
          }}
          className="scroll-mt-8"
        >
          <RevenueImpactCard projectId={projectId ?? null} />
        </section>

        {/* 6. Revenue Stability Monitoring */}
        {projectId ? (
          <section
            id="revenue-stability"
            ref={(el) => {
              sectionRefs.current["revenue-stability"] = el;
            }}
            className="scroll-mt-8"
          >
            <RevenueStabilityMonitoring projectId={projectId} isProUser={isProUserForStability} />
          </section>
        ) : null}

        {/* 7. Competitive Position */}
        <section
          id="competitive-intelligence"
          ref={(el) => {
            sectionRefs.current["competitive-intelligence"] = el;
          }}
          className="scroll-mt-8"
        >
          <CompetitivePositionPanel projectId={projectId ?? null} stored={stored} />
        </section>

        {/* 8. Growth Impact Roadmap */}
        <section
          id="growth-impact-roadmap"
          ref={(el) => {
            sectionRefs.current["growth-impact-roadmap"] = el;
          }}
          className={`scroll-mt-8 ${DASH_SURFACE} p-5 sm:p-6`}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Growth impact roadmap
          </div>
          <h2 className="mt-1 text-base font-semibold text-[#eaefff] sm:text-lg">
            What to sequence for the biggest uplift
          </h2>
          <div className="mt-5">
            <GrowthImpactRoadmap
              riskBreakdown={riskBreakdown ?? null}
              fixPriorities={fixPriorities}
              embedded
            />
          </div>
        </section>

        {/* 9. Priority Fixes — actionable list. */}
        <section
          id="action-priority-list"
          ref={(el) => {
            sectionRefs.current["action-priority-list"] = el;
          }}
          className={`scroll-mt-8 ${DASH_SURFACE} p-5 sm:p-6`}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Priority fixes
          </div>
          <h2 className="mt-1 text-base font-semibold text-[#eaefff] sm:text-lg">
            What to fix first
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Revenue-ranked fixes and secondary optimizations from your latest analysis.
          </p>
          <div className="mt-5">
            <ActionPriorityAccordion
              leakByMetric={
                typeof data.leak_by_metric === "object" && data.leak_by_metric !== null
                  ? (data.leak_by_metric as Record<string, number>)
                  : {}
              }
              metricsForDashboard={metricsForDashboard}
              estimatedMonthlyLeak={
                typeof data.estimatedMonthlyLeak === "number" ? data.estimatedMonthlyLeak : undefined
              }
              isProUser={isProUserForStability}
              onDemoUpgrade={() => setDemoProUnlocked(true)}
              projectId={projectId ?? null}
              revenueStageSnapshot={revenueStageSnapshot}
            />
          </div>
        </section>

        <div className="pt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-[#39FF14] transition hover:border-[#39FF14]/40 hover:bg-[#39FF14]/10"
          >
            ← Analyze another site
          </Link>
        </div>
      </div>

      <RefineRevenueModal
        open={refineModalOpen}
        onOpenChange={setRefineModalOpen}
        projectId={projectId}
        onSaved={(profile) => {
          setRefineModalOpen(false);
          updateStored((prev) => {
            const prevData = prev.data;
            const rawAuditInner = prevData.rawAudit as
              | { audits?: Record<string, { numericValue?: number }> }
              | undefined;
            const audits = rawAuditInner?.audits ?? {};
            const baselineRevenue =
              profile.advancedInputs && Object.keys(profile.advancedInputs).length > 0
                ? computeBaselineRevenue(
                    profile.businessModelId ?? "GENERAL",
                    profile.advancedInputs as Record<string, unknown>
                  )
                : profile.monthlyRevenue;
            const metricsMs = behaviorMetricsMsFromLighthouseAudits(audits);
            const behaviorResult = computeHeadlineRevenueLeak(baselineRevenue, metricsMs);
            const next: StoredProject = {
              ...prev,
              data: {
                ...prevData,
                estimatedMonthlyLeak: behaviorResult.totalLoss,
                leak_by_metric: behaviorResult.leakByMetric,
              },
            };
            return next;
          });
        }}
      />
    </div>
  );
}
