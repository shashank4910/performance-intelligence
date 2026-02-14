"use client";

import { useState, useEffect, useCallback } from "react";

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

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function DetailedMetricsBoard({
  data,
  metricsForDashboard,
}: {
  data: DetailedMetricsData;
  metricsForDashboard?: MetricForDashboard[];
}) {
  const [activeMetric, setActiveMetric] = useState<string | null>(null);

  const handleClose = useCallback(() => setActiveMetric(null), []);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [handleClose]);

  if (metricsForDashboard && metricsForDashboard.length > 0) {
    const active = activeMetric ? metricsForDashboard.find((m) => m.metricKey === activeMetric) : null;
    const bySection = SECTIONS.map(({ id, title }) => ({
      id,
      title,
      metrics: metricsForDashboard.filter((m) => m.metricKey.startsWith(`${id}-`)),
    })).filter((s) => s.metrics.length > 0);

    return (
      <>
        <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 via-slate-900/80 to-slate-900/80 shadow-lg shadow-emerald-500/5">
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
              <div key={id} id={id} className="scroll-mt-8 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="border-b border-white/10 bg-white/5 px-4 py-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--foreground)]">{title}</h3>
                </div>
                <div className="divide-y divide-white/10">
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
                    const buttonClass =
                      metric.verdict === "Poor"
                        ? "text-xs px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition"
                        : "text-xs px-3 py-1.5 rounded-lg border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 transition";
                    return (
                      <div
                        key={metric.metricKey}
                        className="grid grid-cols-4 items-center gap-4 px-4 py-3.5 transition hover:bg-white/[0.02]"
                      >
                        <div className="font-medium text-[var(--foreground)]">{metric.label}</div>
                        <div className="text-sm tabular-nums text-[var(--foreground)]">{metric.displayValue}</div>
                        <div>
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${verdictClass}`}>
                            {metric.verdict}
                          </span>
                        </div>
                        <div className="text-right">
                          {showRootCause && (
                            <button
                              type="button"
                              onClick={() => setActiveMetric(metric.metricKey)}
                              className={buttonClass}
                            >
                              Root Cause
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

        {active && (
          <div
            className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50"
            onClick={(e) => e.target === e.currentTarget && handleClose()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="popup-title"
          >
            <div
              className="w-[540px] max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-slate-900 to-slate-900/95 p-6 shadow-2xl shadow-black/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-5 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <h3 id="popup-title" className="text-lg font-semibold text-[var(--foreground)]">
                    {active.label}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-white/10 hover:text-[var(--foreground)] transition"
                  aria-label="Close"
                >
                  <CloseIcon />
                </button>
              </div>
              {active.aiAnalysis ? (
                <>
                  <div className="mb-4">
                    <div className="text-sm font-semibold text-red-400 mb-1">Root Cause</div>
                    <p className="text-sm text-[var(--foreground)]">{active.aiAnalysis.rootCause}</p>
                  </div>
                  <div className="mt-4 mb-4">
                    <div className="text-sm font-semibold text-emerald-400 mt-4 mb-1">Recommended Fixes</div>
                    <ul className="list-disc list-inside text-sm text-[var(--foreground)] space-y-1">
                      {active.aiAnalysis.fixes.map((fix, i) => (
                        <li key={i}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="text-xs text-[var(--muted)] space-y-1">
                    <div>Impact: {active.aiAnalysis.impact || "—"}</div>
                    <div>Difficulty: {active.aiAnalysis.difficulty || "—"}</div>
                  </div>

                  {active.resources && active.resources.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-white/10">
                      <div className="text-sm font-semibold text-amber-400 mb-3">Affected Resources</div>
                      <div className="space-y-3">
                        {active.resources.map((res, i) => {
                          const badge = res.url ? resourceTypeBadge(res.url) : null;
                          return (
                            <div key={i} className="bg-white/5 rounded-lg p-3 border border-white/8">
                              <div className="flex items-center gap-2 mb-1">
                                {badge && (
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${badge.cls}`}>
                                    {badge.label}
                                  </span>
                                )}
                                <span className="text-sm text-[var(--foreground)] font-mono truncate" title={res.url || res.element || ""}>
                                  {res.url ? truncateUrl(res.url) : res.element || "Unknown element"}
                                </span>
                              </div>
                              <div className="flex gap-4 text-xs text-[var(--muted)]">
                                {res.totalBytes > 0 && <span>Size: {formatBytes(res.totalBytes)}</span>}
                                {res.wastedBytes > 0 && (
                                  <span className="text-red-400">Potential savings: {formatBytes(res.wastedBytes)}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">No AI analysis available. Check Lighthouse description for this metric.</p>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  if (!data) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 via-slate-900/80 to-slate-900/80 shadow-lg shadow-emerald-500/5">
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
            <div key={id} id={id} className="scroll-mt-8 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
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
