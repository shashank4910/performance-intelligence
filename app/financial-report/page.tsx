"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { analyzeMetric, type MetricKey } from "@/lib/metricIntelligenceEngine";
import {
  attributeLeakToResources,
  type ResourceForAttribution,
} from "@/lib/impactEngine/revenueLeakCalculator";
import { getImpactNarrativeFallback } from "@/lib/impactEngine/cortexNarrative";
import { getStageLabel, type CortexStage } from "@/lib/impactEngine/cortexV2";
import LockedRevenueRecovery from "@/components/LockedRevenueRecovery";
import {
  getActionTitleForResource,
  getFilenameFromUrl,
  resourceTypeFromUrl,
} from "@/lib/revenueRecoveryLabels";
import { getProjectReportJson } from "@/lib/projectClientStorage";
import { AppShell } from "@/components/AppShell";
import { resolveLeakForMetricDrawer } from "@/lib/headlineRevenueLeak";

/** Map metric key suffix to CORTEX stage for display. */
function engineKeyToCortexStage(engineKey: string | null): CortexStage {
  if (!engineKey) return "VISUAL_ENTRY";
  const map: Record<string, CortexStage> = {
    lcp: "VISUAL_ENTRY",
    fcp: "VISUAL_ENTRY",
    speedIndex: "VISUAL_ENTRY",
    tti: "INTERACTION",
    tbt: "INTERACTION",
    inp: "INTERACTION",
    mainThread: "INTERACTION",
    bootupTime: "INTERACTION",
    cls: "TRUST",
    unusedJs: "INFRASTRUCTURE",
    unusedCss: "INFRASTRUCTURE",
    ttfb: "INTERACTION",
  };
  return map[engineKey] ?? "VISUAL_ENTRY";
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

function formatCurrency(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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

type StoredProject = {
  url?: string;
  data?: {
    rawAudit?: Record<string, unknown>;
    estimatedMonthlyLeak?: number;
    leak_by_metric?: Record<string, number>;
    metrics_for_dashboard?: Array<{ metricKey: string; label: string }>;
  };
};

function FinancialReportInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const metricParam = searchParams.get("metric");
  const projectIdParam = searchParams.get("projectId");

  const [stored, setStored] = useState<StoredProject | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [isProUser, setIsProUser] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Session-only demo access: allow when opened with ?demo=1 (from UpgradeModal). No localStorage.
    const demoUnlock = searchParams.get("demo") === "1";
    if (!demoUnlock) {
      const dest = projectIdParam ? `/dashboard/${projectIdParam}` : "/dashboard";
      router.replace(dest);
      return;
    }
    setAllowed(true);
  }, [router, projectIdParam, searchParams]);

  useEffect(() => {
    if (!allowed) return;
    if (projectIdParam) {
      try {
        const raw = getProjectReportJson(projectIdParam);
        if (!raw) {
          setStored({});
          return;
        }
        const parsed = JSON.parse(raw) as StoredProject;
        setStored(parsed);
      } catch {
        setStored({});
      }
      return;
    }
    // No projectId: try guest report from localStorage (e.g. from /report)
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("pendingAnalysisResult") : null;
      if (!raw) {
        setStored({});
        return;
      }
      const parsed = JSON.parse(raw) as StoredProject;
      setStored(parsed);
    } catch {
      setStored({});
    }
  }, [projectIdParam, allowed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const plan = (stored?.data as Record<string, unknown> | undefined)?.userPlan;
    const pro =
      plan === "pro" || localStorage.getItem("demoPro") === "true";
    setIsProUser(!!pro);
  }, [stored]);

  const data = stored?.data;
  const rawAudit = data?.rawAudit as { audits?: Record<string, unknown> } | undefined;
  const hasEstimatedLeak =
    typeof data?.estimatedMonthlyLeak === "number" &&
    Number.isFinite(data.estimatedMonthlyLeak) &&
    data.estimatedMonthlyLeak >= 0;
  const estimatedMonthlyLeak = hasEstimatedLeak ? data.estimatedMonthlyLeak : null;
  const leakByMetric =
    typeof data?.leak_by_metric === "object" && data.leak_by_metric !== null
      ? (data.leak_by_metric as Record<string, number>)
      : {};
  const engineKey = metricParam ? metricKeyToEngineKey(metricParam) : null;
  const metricLabel = useMemo(() => {
    if (!metricParam || !data?.metrics_for_dashboard) return null;
    const row = data.metrics_for_dashboard.find((m) => m.metricKey === metricParam);
    return row?.label ?? metricParam;
  }, [metricParam, data?.metrics_for_dashboard]);

  const intelligence = useMemo(() => {
    if (!rawAudit || !engineKey) return null;
    return analyzeMetric(rawAudit, engineKey);
  }, [rawAudit, engineKey]);

  const resources = intelligence?.contributingResources ?? [];
  const leakForMetric = engineKey ? resolveLeakForMetricDrawer(engineKey, leakByMetric) : 0;
  const resourcesForAttribution: ResourceForAttribution[] = resources.map((r) => ({
    impactLevel: r.urgencyLevel,
    resourceSize: (r as { transferSize?: number }).transferSize ?? 0,
  }));
  const attributedAmounts = attributeLeakToResources(leakForMetric, resourcesForAttribution);
  const stage = engineKeyToCortexStage(engineKey);
  const stageLabel = getStageLabel(stage);

  const lockedPreviewOpportunities = useMemo(() => {
    if (!engineKey || !metricLabel || !resources.length) return [];
    return resources.slice(0, 2).map((res) => {
      const type = resourceTypeFromUrl(res.url);
      const actionTitle = getActionTitleForResource(res.url, engineKey, type);
      const filename = getFilenameFromUrl(res.url) || "Resource";
      return { actionTitle, filename, metricAffected: metricLabel };
    });
  }, [engineKey, metricLabel, resources]);

  if (allowed !== true) {
    return (
      <AppShell contentClassName="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--muted)]">Redirecting…</p>
      </AppShell>
    );
  }

  if (!isProUser) {
    return (
      <AppShell contentClassName="text-[var(--foreground)]">
        <div className="mx-auto max-w-4xl p-8">
        <header className="border-b border-white/10 pb-6 mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Revenue Recovery Opportunities</h1>
          {stored?.url && (
            <p className="mt-1 text-sm text-[var(--muted)]">{stored.url}</p>
          )}
          <div className="mt-4">
            <Link
              href={projectIdParam ? `/dashboard/${projectIdParam}` : "/dashboard"}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </header>
        <LockedRevenueRecovery
          previewOpportunities={lockedPreviewOpportunities}
          standalone={false}
        />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell contentClassName="text-[var(--foreground)]">
      <div className="mx-auto max-w-4xl p-8">
      <header className="border-b border-white/10 pb-6 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Full Financial Forensic Audit</h1>
        {stored?.url && (
          <p className="mt-1 text-sm text-[var(--muted)]">{stored.url}</p>
        )}
        <div className="mt-4 flex gap-4 items-center">
          <Link
            href={projectIdParam ? `/dashboard/${projectIdParam}` : "/dashboard"}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3">Total Revenue Leak</h2>
        <p className="text-2xl font-semibold text-[var(--accent)]">
          {estimatedMonthlyLeak != null ? (
            <>
              {formatCurrency(estimatedMonthlyLeak)}{" "}
              <span className="text-sm font-normal text-[var(--muted)]">/ month</span>
            </>
          ) : (
            <span className="text-lg font-medium text-[var(--muted)]">— Run analyze to populate</span>
          )}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3">Leak by Metric</h2>
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="text-left px-4 py-3 font-medium text-[var(--muted)]">Metric</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--muted)]">Attributed Leak / mo</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(leakByMetric).map(([key, value]) => (
                <tr key={key} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-medium">{key}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {metricParam && engineKey && (
        <>
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              Focus: {metricLabel ?? metricParam}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Stage: {stageLabel} · Metric leak: {formatCurrency(leakForMetric)}/mo
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3">Per-Resource Revenue Impact</h2>
            <div className="space-y-4">
              {resources.map((res, idx) => {
                const amount = attributedAmounts[idx] ?? 0;
                const narrative = getImpactNarrativeFallback({ stage, resourceLeak: amount });
                const displayName = res.url && res.url.length > 60 ? truncateUrl(res.url) : (res.url || "Element");
                return (
                  <div
                    key={idx}
                    className="ui-panel ui-panel--muted rounded-lg p-4"
                  >
                    <div className="font-medium text-[var(--foreground)] truncate" title={res.url}>
                      {displayName}
                    </div>
                    <div className="mt-2 text-sm font-medium text-[var(--accent)]">
                      Revenue Impact: {formatCurrency(amount)}/mo
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{narrative}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
      </div>
    </AppShell>
  );
}

export default function FinancialReportPage() {
  return (
    <Suspense
      fallback={
        <AppShell contentClassName="text-[var(--foreground)]">
          <div className="mx-auto max-w-4xl p-8" />
        </AppShell>
      }
    >
      <FinancialReportInner />
    </Suspense>
  );
}
