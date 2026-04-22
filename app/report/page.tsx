"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import DetailedMetricsBoard from "@/components/DetailedMetricsBoard";
import { AnimatedNumber, AnimatedProgressBar } from "@/components/AnimatedNumber";
import { ReportLockWrapper } from "@/components/ReportLockWrapper";
import RevenueImpactCard from "@/components/RevenueImpactCard";
import RevenueRecoveryOpportunities from "@/components/RevenueRecoveryOpportunities";
import { riskMetricMap } from "@/lib/riskMetricMap";
import { scrollToMetric } from "@/lib/scrollToMetric";
import { revenueExposureContextLine } from "@/lib/revenueExposureCopy";
import { AppShell } from "@/components/AppShell";

const PENDING_KEY = "pendingAnalysisResult";

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

type PendingResult = {
  url: string;
  data: Record<string, unknown> & {
    summary?: {
      overall_health_score?: number;
      overall_health_display?: string;
      business_impact?: { impact_level?: string };
      executive_summary?: string;
      executive_summary_json?: {
        headline: string;
        impact: string;
        constraint: string;
        action: string;
      };
      executive_summary_paragraph?: string;
    };
    overallHealth?: number;
    revenueRiskScore?: number;
    revenueRiskLevel?: string;
    risk_breakdown?: RiskBreakdown;
    fix_priorities?: FixPriority[];
    deviceImpact?: {
      mobile?: { health?: number; revenueRiskScore?: number };
      desktop?: { health?: number; revenueRiskScore?: number };
    };
    revenueImpactInputs?: { lcpSeconds?: number; inpMs?: number | null };
    detailed_metrics?: Record<string, unknown>;
    metrics_for_dashboard?: Array<{ metricKey: string; label: string; displayValue: string; verdict: string }>;
    rawAudit?: Record<string, unknown>;
    leak_by_metric?: Record<string, number>;
    estimatedMonthlyLeak?: number;
  };
};

function heroHealthColor(score0to100: number) {
  return score0to100 >= 80 ? "text-emerald-400" : score0to100 >= 50 ? "text-amber-400" : "text-red-400";
}

function riskLevelClass(level: string | undefined) {
  if (!level) return "bg-white/10 text-[var(--muted)]";
  const l = level.toLowerCase();
  if (l === "low" || l === "good") return "bg-emerald-500/20 text-emerald-400";
  if (l === "moderate" || l === "needs improvement") return "bg-amber-500/20 text-amber-400";
  return "bg-red-500/20 text-red-400";
}

export default function ReportPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingResult | null | "loading">("loading");
  const [demoProUnlocked, setDemoProUnlocked] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) {
        router.replace("/");
        return;
      }
      const parsed = JSON.parse(raw) as PendingResult;
      if (!parsed?.url || !parsed?.data) {
        router.replace("/");
        return;
      }
      setPending(parsed);
    } catch {
      router.replace("/");
    }
  }, [router]);

  if (pending === "loading") {
    return (
      <AppShell contentClassName="flex min-h-screen items-center justify-center">
        <span className="text-sm text-[var(--muted)]">Loading report…</span>
      </AppShell>
    );
  }

  if (!pending) return null;

  const data = pending.data;
  const summary = data.summary;
  const healthScore100 =
    typeof data.overallHealth === "number"
      ? data.overallHealth
      : typeof summary?.overall_health_score === "number"
        ? summary.overall_health_score
        : Number(summary?.overall_health_display) || 0;
  const healthDisplay10 = healthScore100 ? (healthScore100 / 10).toFixed(1) : "—";
  const riskBreakdown = data.risk_breakdown;
  const fixPriorities = (data.fix_priorities as FixPriority[] | undefined) ?? [];
  const deviceImpact = data.deviceImpact;
  const revenueInputs = data.revenueImpactInputs;
  const lcpSeconds = revenueInputs?.lcpSeconds ?? 0;
  const inpMs = revenueInputs?.inpMs ?? null;
  const detailedMetrics = data.detailed_metrics as Parameters<typeof DetailedMetricsBoard>[0]["data"];
  const metricsForDashboard = data.metrics_for_dashboard as Parameters<typeof DetailedMetricsBoard>[0]["metricsForDashboard"];
  const rawAudit = data.rawAudit ?? null;

  const reportContent = (
    <AppShell contentClassName="p-8 pb-16">
      <div className="mx-auto max-w-4xl space-y-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Performance Report</h1>
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
            ← Back to Analyze
          </Link>
        </div>
        <p className="text-sm text-[var(--muted)]">{pending.url}</p>

        <section className="scroll-mt-8">
          <h2 className="text-lg font-semibold text-white mb-4">Dashboard</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="ui-panel p-6">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-[var(--muted)]">Website Health</span>
                <span className={`text-2xl font-semibold tabular-nums ${heroHealthColor(healthScore100)}`}>
                  {healthDisplay10} / 10
                </span>
              </div>
              <div className="mt-3">
                <AnimatedProgressBar value={healthScore100} barClassName="bg-emerald-500" />
              </div>
            </div>
            <div className="ui-panel p-6 border-t-2 border-t-[var(--accent)]/25">
              <div className="text-sm font-medium text-[var(--foreground)]">Revenue Exposure</div>
              <p className="mt-1 text-xs text-[var(--muted)] leading-snug">
                This reflects how performance issues are putting your revenue at risk
              </p>
              <p className="mt-3 text-sm text-[var(--foreground)] leading-snug">
                {revenueExposureContextLine(
                  typeof data.revenueRiskLevel === "string" ? data.revenueRiskLevel : undefined,
                  summary?.business_impact?.impact_level,
                  riskBreakdown ?? undefined
                )}
              </p>
              <p className="mt-2 text-sm text-[var(--foreground)]">
                This contributes to your estimated monthly loss of{" "}
                {typeof data.estimatedMonthlyLeak === "number"
                  ? `$${data.estimatedMonthlyLeak.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—"}
              </p>
              {typeof data.revenueRiskScore === "number" && (
                <p className="mt-1 text-[10px] text-[var(--muted)]/70 tabular-nums">
                  Index (internal): {Math.round(data.revenueRiskScore)}/100
                </p>
              )}
              <p className="mt-2 text-[11px] text-[var(--muted)] leading-snug">
                See{" "}
                <button
                  type="button"
                  onClick={() => scrollToMetric("report-revenue-impact")}
                  className="text-[var(--accent)] hover:underline"
                >
                  Revenue Impact
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => scrollToMetric("report-fix-priorities")}
                  className="text-[var(--accent)] hover:underline"
                >
                  What to fix first
                </button>
                .
              </p>
            </div>
            {deviceImpact && (
              <div className="ui-panel p-6">
                <div className="text-sm text-[var(--muted)]">Device impact</div>
                <div className="mt-2 flex gap-4">
                  {deviceImpact.mobile && (
                    <span className="text-sm">
                      Mobile: <span className="font-medium text-[var(--foreground)]">{deviceImpact.mobile.health ?? "—"}</span>
                    </span>
                  )}
                  {deviceImpact.desktop && (
                    <span className="text-sm">
                      Desktop: <span className="font-medium text-[var(--foreground)]">{deviceImpact.desktop.health ?? "—"}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          {riskBreakdown && (
            <div className="mt-6 ui-panel p-6">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Risk breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { key: "speed", label: "Speed", score: riskBreakdown.speed_risk_score, level: riskBreakdown.speed_risk_level },
                  { key: "ux", label: "UX", score: riskBreakdown.ux_risk_score, level: riskBreakdown.ux_risk_level },
                  { key: "seo", label: "SEO", score: riskBreakdown.seo_risk_score, level: riskBreakdown.seo_risk_level },
                  { key: "conversion", label: "Conversion", score: riskBreakdown.conversion_risk_score, level: riskBreakdown.conversion_risk_level },
                  { key: "scaling", label: "Scaling", score: riskBreakdown.scaling_risk_score, level: riskBreakdown.scaling_risk_level },
                ].map(({ key, label, score, level }) => {
                  const metrics = riskMetricMap[label];
                  const isLow = level?.toLowerCase() === "low" || level?.toLowerCase() === "good";
                  const buttonLabel = isLow ? "Contributing Metrics" : "Metrics Responsible";
                  return (
                    <div key={key} className="rounded-lg bg-white/5 p-3">
                      <div className="text-xs text-[var(--muted)]">{label}</div>
                      {typeof score === "number" && (
                        <div className="mt-1 text-sm font-medium tabular-nums text-[var(--foreground)]">
                          <AnimatedNumber value={score} />
                        </div>
                      )}
                      {level && (
                        <span className={`mt-1 inline-block px-2 py-0.5 rounded text-xs font-medium ${riskLevelClass(level)}`}>
                          {level}
                        </span>
                      )}
                      {metrics?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => scrollToMetric(metrics[0])}
                          className="mt-2 w-full rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-all duration-200 hover:bg-white/10 hover:shadow-[0_0_12px_rgba(190,254,52,0.2)]"
                        >
                          {buttonLabel}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {summary?.executive_summary_paragraph || summary?.executive_summary ? (
            <div className="mt-6 w-full ui-panel p-6">
              <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Executive summary</h3>
              <p className="w-full text-sm text-[var(--muted)] leading-relaxed">
                {summary.executive_summary_paragraph ?? summary.executive_summary}
              </p>
            </div>
          ) : null}
        </section>

        <section id="report-revenue-impact" className="scroll-mt-8">
          <h2 className="text-lg font-semibold text-white">Revenue Impact</h2>
          <RevenueImpactCard />
        </section>

        <section className="scroll-mt-8">
          <RevenueRecoveryOpportunities
            leakByMetric={typeof data.leak_by_metric === "object" && data.leak_by_metric !== null ? data.leak_by_metric : {}}
            metricsForDashboard={metricsForDashboard ?? undefined}
            estimatedMonthlyLeak={typeof data.estimatedMonthlyLeak === "number" ? data.estimatedMonthlyLeak : undefined}
          />
        </section>

        <section className="scroll-mt-8">
          <h2 className="text-lg font-semibold text-white">Metrics</h2>
          <div className="mt-4">
            <DetailedMetricsBoard
              data={detailedMetrics ?? null}
              metricsForDashboard={metricsForDashboard}
              rawAudit={rawAudit}
              estimatedMonthlyLeak={typeof data.estimatedMonthlyLeak === "number" ? data.estimatedMonthlyLeak : undefined}
              leakByMetric={typeof data.leak_by_metric === "object" && data.leak_by_metric !== null ? data.leak_by_metric : undefined}
              isProUser={demoProUnlocked}
              onDemoUpgrade={() => setDemoProUnlocked(true)}
            />
          </div>
        </section>

        <section id="report-fix-priorities" className="scroll-mt-8">
          <h2 className="text-lg font-semibold text-white">What to fix first</h2>
          {fixPriorities.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {fixPriorities.map((fp, i) => (
                <li key={i} className="ui-panel ui-panel--muted rounded-lg p-4">
                  <div className="font-medium text-[var(--foreground)] capitalize">{fp.category}</div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    Risk score: <AnimatedNumber value={fp.score} /> — Priority:{" "}
                    <span className={fp.priority === "High" ? "text-red-400" : fp.priority === "Medium" ? "text-amber-400" : "text-[var(--muted)]"}>
                      {fp.priority}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-[var(--muted)]">Prioritized fixes appear here after analysis.</p>
          )}
        </section>
      </div>
    </AppShell>
  );

  return (
    <ReportLockWrapper isLocked={true}>
      {reportContent}
    </ReportLockWrapper>
  );
}
