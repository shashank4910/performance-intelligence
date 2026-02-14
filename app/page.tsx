"use client";

import { useId, useState } from "react";
import DetailedMetricsBoard from "@/components/DetailedMetricsBoard";

const RISK_TOOLTIPS: Record<string, { business: string; technical: string }> = {
  Speed: {
    business: "Page load time is slowing user engagement and impacting revenue.",
    technical: "Calculated from LCP, TTFB and render-blocking resource delays.",
  },
  UX: {
    business: "Visual instability or input lag may reduce user trust and retention.",
    technical: "Derived from CLS (layout shift) and INP (interaction responsiveness).",
  },
  SEO: {
    business: "Technical SEO weaknesses may limit organic visibility.",
    technical: "Based on crawlability, metadata quality, and structural best practices.",
  },
  Conversion: {
    business: "Performance friction may reduce checkout or signup completion rates.",
    technical: "Influenced by load delay, interaction latency, and critical path timing.",
  },
  Scaling: {
    business: "Infrastructure may not sustain higher traffic volumes efficiently.",
    technical: "High TTFB or backend latency indicates potential bottlenecks.",
  },
};

const RISK_SECTION_MAP: Record<string, string> = {
  Speed: "load",
  UX: "core",
  SEO: "backend",
  Conversion: "load",
  Scaling: "backend",
};

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden width="1em" height="1em">
      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.06.085 1.49 1.357.693 2.43l-4.082 3.294 1.504 5.031c.27.918-.797 1.698-1.624 1.118L12 18.35l-4.755 3.117c-.827.58-1.894-.2-1.623-1.118l1.504-5.03-4.082-3.294c-.798-1.073-.367-2.346.692-2.43l5.404-.434 2.082-5.005z" clipRule="evenodd" />
    </svg>
  );
}

function RiskBar({
  label,
  value,
  max = 100,
  tooltip,
  section,
}: {
  label: string;
  value: number;
  max?: number;
  tooltip?: { business: string; technical: string };
  section?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const score = Math.min(max, Math.max(0, value));
  const health = 100 - score;
  const healthRounded = Math.round(health / 10);
  const filledStars = Math.min(10, Math.max(0, healthRounded));
  const color =
    healthRounded >= 8 ? "text-emerald-400" : healthRounded >= 5 ? "text-amber-400" : "text-red-400";

  const labelNode = (
    <span className="text-[var(--muted)]">
      {tooltip ? (
        <span className="relative inline-block group">
          <span
            tabIndex={0}
            aria-describedby={id}
            onFocus={() => setVisible(true)}
            onBlur={() => setVisible(false)}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            className="cursor-help border-b border-dotted border-[var(--muted)]/50"
          >
            {label}
          </span>
          <span
            id={id}
            role="tooltip"
            className={`absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl bg-[var(--card)] backdrop-blur-md border border-white/8 px-3 py-2.5 text-sm shadow-lg transition-opacity duration-200 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            <span className="block font-medium text-[var(--foreground)]">
              {tooltip.business}
            </span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              {tooltip.technical}
            </span>
          </span>
        </span>
      ) : (
        label
      )}
    </span>
  );

  return (
    <tr className="border-b border-white/10 last:border-b-0 transition-colors hover:bg-white/[0.02]">
      <td className="py-3.5 pl-4 pr-4 align-middle text-sm text-[var(--foreground)]">
        {labelNode}
      </td>
      <td className="py-3.5 pr-4 align-middle">
        <div className="flex gap-0.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((i) => (
            <span key={i} className={i <= filledStars ? color : "text-white/20"}><StarIcon className="w-4 h-4" /></span>
          ))}
        </div>
      </td>
      <td className={`py-3.5 pr-4 align-middle text-sm font-semibold tabular-nums ${color}`}>
        {healthRounded} / 10
      </td>
      <td className="py-3.5 pr-4 align-middle text-right">
        {section && (
          <button
            type="button"
            onClick={() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-white/10 hover:border-red-500/30"
          >
            Metrics Responsible →
          </button>
        )}
      </td>
    </tr>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [revenueImpact, setRevenueImpact] = useState<any>(null);
  const [showRevenueEstimator, setShowRevenueEstimator] = useState(false);
  const [loadingRevenue, setLoadingRevenue] = useState(false);
  const [revenueMessage, setRevenueMessage] = useState<string | null>(null);
  const [estimatorRevenue, setEstimatorRevenue] = useState("");
  const [estimatorMobile, setEstimatorMobile] = useState("");
  const [estimatorIndustry, setEstimatorIndustry] = useState("general");

  const analyzePerformance = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setPerformanceData(null);
    setRevenueImpact(null);
    setRevenueMessage(null);

    try {
      const response = await fetch(
        `/api/analyze?url=${encodeURIComponent(url)}&revenue=0&mobileShare=100&industry=general`
      );
      const data = await response.json();
      if (!response.ok) {
        setPerformanceData({ error: data?.error || `Request failed (${response.status})` });
        return;
      }
      setPerformanceData(data);
    } catch {
      setPerformanceData({ error: "Failed to analyze. Please check the URL and try again." });
    } finally {
      setLoading(false);
    }
  };

  const toggleRevenueSection = () => {
    setShowRevenueEstimator((prev) => !prev);
    if (showRevenueEstimator) setRevenueMessage(null);
  };

  const calculateRevenueImpact = async () => {
    setRevenueMessage(null);
    if (!performanceData || performanceData?.error) {
      setRevenueMessage("Run Performance Analysis first.");
      return;
    }
    const revenue = estimatorRevenue.trim() === "" ? 0 : Number(estimatorRevenue) || 0;
    const mobileSharePct = estimatorMobile.trim() === "" ? 100 : Math.min(100, Math.max(0, Number(estimatorMobile) || 100));
    if (revenue <= 0) {
      setRevenueMessage("Enter monthly revenue.");
      return;
    }

    setLoadingRevenue(true);
    try {
      const industryParam = estimatorIndustry && estimatorIndustry !== "" ? estimatorIndustry : "general";
      const response = await fetch(
        `/api/analyze?url=${encodeURIComponent(url)}&revenue=${revenue}&mobileShare=${mobileSharePct}&industry=${encodeURIComponent(industryParam)}`
      );
      const data = await response.json();
      if (!response.ok) {
        setRevenueMessage(data?.error || "Request failed.");
        return;
      }
      if (data.revenueImpact) {
        setRevenueImpact(data.revenueImpact);
      } else {
        setRevenueMessage("Could not calculate revenue impact.");
      }
    } catch {
      setRevenueMessage("Failed to calculate revenue impact.");
    } finally {
      setLoadingRevenue(false);
    }
  };

  const result = performanceData;
  const rb = result?.risk_breakdown;
  const toNum = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const riskScores = rb
    ? [
        { label: "Speed", value: toNum(rb.speed_risk_score), tooltip: RISK_TOOLTIPS.Speed, section: RISK_SECTION_MAP.Speed },
        { label: "UX", value: toNum(rb.ux_risk_score), tooltip: RISK_TOOLTIPS.UX, section: RISK_SECTION_MAP.UX },
        { label: "SEO", value: toNum(rb.seo_risk_score), tooltip: RISK_TOOLTIPS.SEO, section: RISK_SECTION_MAP.SEO },
        { label: "Conversion", value: toNum(rb.conversion_risk_score), tooltip: RISK_TOOLTIPS.Conversion, section: RISK_SECTION_MAP.Conversion },
        { label: "Scaling", value: toNum(rb.scaling_risk_score), tooltip: RISK_TOOLTIPS.Scaling, section: RISK_SECTION_MAP.Scaling },
      ]
    : [];
  const hasPerformance = performanceData && performanceData.summary && !performanceData.error;

  return (
    <div className="min-h-screen bg-dashboard bg-grid flex flex-col lg:flex-row">
      {/* Left sidebar - stacks below on small */}
      <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-white/8 bg-[var(--card)]/50 backdrop-blur-sm px-4 py-6 lg:py-8 lg:pl-6 lg:pr-4">
        <div className="max-w-xl lg:max-w-none mx-auto lg:mx-0 flex flex-row lg:flex-col items-center lg:items-stretch justify-between lg:justify-start gap-4 lg:gap-8">
          <h1 className="text-lg font-semibold gradient-text tracking-tight">Performance Intelligence</h1>
          <nav className="flex gap-2 lg:flex-col lg:gap-1 text-sm">
            <span className="rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] px-3 py-2 font-medium">Dashboard</span>
            <a href="/" className="rounded-lg text-[var(--muted)] hover:bg-white/5 hover:text-[var(--foreground)] px-3 py-2 transition-colors">Analyze</a>
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 py-8 lg:py-12 lg:px-8 overflow-auto">
        {/* Hero */}
        <header className="text-center mb-8 md:mb-10 w-full max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-semibold text-[var(--foreground)] tracking-tight mb-2">
            Performance Intelligence
          </h2>
          <p className="text-[var(--muted)] text-base max-w-md mx-auto">
            Analyze UI performance metrics and get actionable insights in seconds.
          </p>
        </header>

        {/* Input Card */}
        <div className="w-full max-w-xl card-glass p-8">
        <label className="block text-sm font-medium text-[var(--muted)] mb-3">
          Website URL
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyzePerformance()}
            className="flex-1 rounded-xl bg-white/5 border border-white/8 px-4 py-3.5 text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]/30 transition-all duration-200"
            disabled={loading}
          />
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <button
              onClick={analyzePerformance}
              disabled={loading || !url.trim()}
              className="rounded-xl px-5 py-3.5 font-semibold text-sm text-white bg-[var(--accent)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all duration-200"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-[var(--background)] border-t-transparent rounded-full animate-spin" />
                  Analyzing…
                </>
              ) : (
                "Analyze Performance"
              )}
            </button>
          </div>
        </div>

        <div className="hidden" aria-hidden="true">
        <input
          type="number"
          placeholder="500000"
          value={estimatorRevenue}
          onChange={(e) => setEstimatorRevenue(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-3.5 text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 transition-all duration-200"
          disabled={loading}
          min={0}
        />

        <label className="block text-sm font-medium text-[var(--muted)] mt-5 mb-3">
          Mobile Traffic (%)
        </label>
        <input
          type="number"
          placeholder="70"
          value={estimatorMobile}
          onChange={(e) => setEstimatorMobile(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-3.5 text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 transition-all duration-200"
          disabled={loading}
          min={0}
          max={100}
        />

        <label className="block text-sm font-medium text-[var(--muted)] mt-5 mb-3">
          Industry (optional)
        </label>
        <select
          value={estimatorIndustry}
          onChange={(e) => setEstimatorIndustry(e.target.value)}
          className="w-full rounded-xl bg-white/5 border border-white/8 px-4 py-3.5 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)]/30 transition-all duration-200"
          disabled={loading}
        >
          <option value="general">General</option>
          <option value="ecommerce">E‑commerce</option>
          <option value="finance">Finance</option>
          <option value="saas">SaaS</option>
          <option value="healthcare">Healthcare</option>
        </select>
        </div>
      </div>

      {/* Error state */}
      {performanceData?.error && (
        <div className="mt-8 w-full max-w-xl card-glass p-8 text-[var(--danger)]">
          {performanceData.error}
        </div>
      )}

      {/* Results */}
      {hasPerformance && (
        <div className="w-full max-w-5xl mx-auto mt-10 space-y-10">
          {/* Summary Card */}
          <div className="card-glass p-8">
            {(() => {
              const score = typeof result.summary.overall_health_score === "number" ? result.summary.overall_health_score : Number(result.summary.overall_health_display) || 0;
              const scoreColor = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-yellow-400" : "text-red-400";
              const riskLevel = result.summary.risk_level;
              const riskBadgeClass = riskLevel === "Low" ? "bg-emerald-500/20 text-emerald-400" : riskLevel === "Medium" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400";
              return (
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className={`text-2xl font-semibold ${scoreColor}`}>
                    {result.summary.overall_health_display}
                  </h2>
                  <span className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium ${riskBadgeClass}`}>
                    Risk: {result.summary.risk_level}
                  </span>
                </div>
              );
            })()}
            <p className="text-base text-[var(--muted)] leading-relaxed mb-0">
              {result.summary.executive_summary}
            </p>

            {/* Business Impact + Check Revenue Impact */}
            {result.summary.business_impact && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">
                      Business Impact
                    </h3>
                    <p className="text-sm text-[var(--muted)] mt-1">
                      Impact level:{" "}
                      <span className={(() => {
                        const level = result.summary.business_impact?.impact_level ?? "";
                        return level === "Minimal" ? "text-emerald-400" : level === "Moderate" ? "text-yellow-400" : level === "Significant" ? "text-orange-400" : level === "Severe" ? "text-red-400" : level === "Critical" ? "text-red-500" : "text-[var(--foreground)]";
                      })()}>
                        {result.summary.business_impact?.impact_level}
                      </span>
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      Est. conversion loss: {result.summary.business_impact?.estimated_conversion_loss}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleRevenueSection}
                    className={`px-4 py-2 text-sm rounded-lg border transition-all duration-200 ${
                      result.summary.business_impact?.impact_level === "Severe" || result.summary.business_impact?.impact_level === "Critical"
                        ? "border-blue-500 text-blue-400 hover:bg-blue-500/10"
                        : "border-white/20 text-[var(--muted)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                    }`}
                  >
                    Check Revenue Impact →
                  </button>
                </div>

                {showRevenueEstimator && (
                  <div className="mt-6 overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 via-slate-900/80 to-slate-900/80 transition-all duration-300 shadow-lg shadow-amber-500/5">
                    <div className="border-b border-white/10 bg-white/5 px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                            Revenue Impact
                          </h4>
                          <p className="text-xs text-[var(--muted)] mt-0.5">
                            Estimate potential revenue at risk from performance issues
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                            Monthly revenue (₹)
                          </label>
                          <input
                            type="number"
                            placeholder="e.g. 5,00,000"
                            value={estimatorRevenue}
                            onChange={(e) => setEstimatorRevenue(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-[var(--foreground)] placeholder:text-[var(--muted)]/70 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-colors"
                            min={0}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                            Mobile traffic (%)
                          </label>
                          <input
                            type="number"
                            placeholder="e.g. 70"
                            value={estimatorMobile}
                            onChange={(e) => setEstimatorMobile(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-[var(--foreground)] placeholder:text-[var(--muted)]/70 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-colors"
                            min={0}
                            max={100}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                            Industry
                          </label>
                          <select
                            value={estimatorIndustry}
                            onChange={(e) => setEstimatorIndustry(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-[var(--foreground)] focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-colors"
                          >
                            <option value="general">General</option>
                            <option value="ecommerce">E-commerce</option>
                            <option value="saas">SaaS</option>
                            <option value="finance">Finance</option>
                            <option value="healthcare">Healthcare</option>
                          </select>
                        </div>
                        <div className="flex flex-col justify-end">
                          {revenueMessage && (
                            <p className="mb-2 text-xs text-amber-400" role="alert">{revenueMessage}</p>
                          )}
                          <button
                            type="button"
                            onClick={calculateRevenueImpact}
                            disabled={loadingRevenue}
                            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-md shadow-amber-500/25 transition hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                          >
                            {loadingRevenue ? (
                              <>
                                <span className="inline-block h-4 w-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                                Calculating…
                              </>
                            ) : (
                              <>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                Calculate impact
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                    {revenueImpact && (
                      <div className="mt-8 space-y-6 rounded-xl border border-white/10 bg-white/[0.02] p-6">
                        <div className="grid gap-6 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)] mb-2">
                              Estimated at risk
                            </p>
                            <p className="text-2xl font-bold tabular-nums tracking-tight text-red-400">
                              ₹{Math.round(revenueImpact.minMonthlyLoss).toLocaleString("en-IN")} – ₹{Math.round(revenueImpact.maxMonthlyLoss).toLocaleString("en-IN")}
                            </p>
                            <p className="text-sm text-[var(--muted)] mt-1">per month</p>
                            <p className="mt-2 text-sm tabular-nums text-red-400/80">
                              ₹{Math.round(revenueImpact.minAnnualLoss).toLocaleString("en-IN")} – ₹{Math.round(revenueImpact.maxAnnualLoss).toLocaleString("en-IN")} per year
                            </p>
                          </div>
                          <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/30 p-4">
                            <p className="text-xs font-medium uppercase tracking-wider text-emerald-400/90 mb-2">
                              Recoverable if optimized
                            </p>
                            <p className="text-xl font-bold tabular-nums text-emerald-400">
                              ₹{Math.round(revenueImpact.recoveryPotentialMin).toLocaleString("en-IN")} – ₹{Math.round(revenueImpact.recoveryPotentialMax).toLocaleString("en-IN")}
                            </p>
                            <p className="text-sm text-emerald-400/80 mt-1">per month</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[var(--foreground)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Confidence: {revenueImpact.confidenceLabel} ({revenueImpact.confidenceScore}%)
                          </span>
                          {revenueImpact.riskDrivers && (
                            <div className="flex flex-wrap gap-2">
                              {["lcpImpact", "clsImpact", "inpImpact", "mobileImpact"].map((key) => {
                                const k = key as keyof typeof revenueImpact.riskDrivers;
                                const label = { lcpImpact: "LCP", clsImpact: "CLS", inpImpact: "INP", mobileImpact: "Mobile" }[key];
                                const val = revenueImpact.riskDrivers[k];
                                return val ? (
                                  <span key={key} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-[var(--muted)]">
                                    {label}: <span className="font-medium text-[var(--foreground)]">{val}</span>
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                          Modeled estimate based on industry performance–conversion research. Ranges reflect uncertainty in the model.
                        </p>
                      </div>
                    )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Risk Breakdown */}
          {riskScores.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/15 via-slate-900/80 to-slate-900/80 shadow-lg shadow-red-500/5">
              <div className="border-b border-white/10 bg-white/5 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                      Risk breakdown
                    </h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      Health score by category — click through to see responsible metrics
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="table-scroller rounded-xl border border-white/10 -mx-1 px-1">
                  <table className="w-full min-w-[420px] text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                        <th className="py-3.5 pl-4 pr-4">Category</th>
                        <th className="py-3.5 pr-4">Stars</th>
                        <th className="py-3.5 pr-4">Health</th>
                        <th className="py-3.5 pr-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riskScores.map(({ label, value, tooltip, section }) => (
                        <RiskBar
                          key={label}
                          label={label}
                          value={value}
                          tooltip={tooltip}
                          section={section}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Top Fix Priorities */}
          {Array.isArray(result.fix_priorities) &&
            result.fix_priorities.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/15 via-slate-900/80 to-slate-900/80 shadow-lg shadow-indigo-500/5">
                <div className="border-b border-white/10 bg-white/5 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                        Top Fix Priorities
                      </h3>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        Focus areas to improve performance — ordered by impact
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {result.fix_priorities.map(
                      (
                        item: { category: string; score: number; priority: string },
                        index: number
                      ) => {
                        const categoryLabel =
                          item.category === "ux" ? "UX" : item.category === "seo" ? "SEO" : item.category.charAt(0).toUpperCase() + item.category.slice(1);
                        const isHigh = (item.priority || "").toLowerCase().includes("high") || item.score >= 70;
                        return (
                          <div
                            key={`${item.category}-${index}`}
                            className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-4 py-3.5 transition hover:bg-white/[0.02] ${
                              isHigh ? "border-indigo-500/25 bg-indigo-500/5" : "border-white/10 bg-white/[0.02]"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm font-bold tabular-nums text-[var(--foreground)]">
                                {index + 1}
                              </span>
                              <span className="font-semibold text-[var(--foreground)]">
                                {categoryLabel}
                              </span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
                                Score{" "}
                                <span className="font-mono font-semibold text-[var(--foreground)]">{item.score}</span>
                              </span>
                              <span className="inline-flex items-center rounded-full bg-indigo-500/20 text-indigo-400 px-3 py-1 text-xs font-medium">
                                {item.priority}
                              </span>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            )}

          {result.detailed_metrics && (
            <DetailedMetricsBoard
              data={result.detailed_metrics}
              metricsForDashboard={result.metrics_for_dashboard}
            />
          )}

          {/* Two-column: Issues & Actions */}
          <div className="grid md:grid-cols-2 gap-6">
            {Array.isArray(result.top_issues) && result.top_issues.length > 0 && (
              <div className="card-glass p-8">
                <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--danger)]" />
                  Top issues
                </h3>
                <ul className="space-y-3">
                  {result.top_issues.map((item: any, index: number) => (
                    <li
                      key={index}
                      className="flex gap-3 text-sm text-[var(--muted)] border-l-2 border-[var(--danger)]/40 pl-4 py-1"
                    >
                      <span className="text-[var(--foreground)] font-medium shrink-0">
                        {index + 1}.
                      </span>
                      {item.issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(result.prioritized_actions) &&
              result.prioritized_actions.length > 0 && (
                <div className="card-glass p-8">
                  <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
                    Prioritized actions
                  </h3>
                  <ul className="space-y-3">
                    {result.prioritized_actions.map((item: any, index: number) => (
                      <li
                        key={index}
                        className="flex gap-3 text-sm text-[var(--muted)] border-l-2 border-[var(--success)]/40 pl-4 py-1"
                      >
                        <span className="text-[var(--foreground)] font-medium shrink-0">
                          {index + 1}.
                        </span>
                        {item.action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
