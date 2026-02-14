"use client";

import { useState } from "react";

function RiskBar({
  label,
  value,
  max = 100,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color =
    pct <= 33 ? "bg-[var(--success)]" : pct <= 66 ? "bg-[var(--warning)]" : "bg-[var(--danger)]";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="font-mono tabular-nums text-[var(--foreground)]">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--card-border)] overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700 ease-out animate-score-fill`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const analyzeWebsite = async () => {
    if (!url) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        `/api/analyze?url=${encodeURIComponent(url)}`
      );
      const data = await response.json();
      if (!response.ok) {
        setResult({ error: data?.error || `Request failed (${response.status})` });
        return;
      }
      setResult(data);
    } catch {
      setResult({ error: "Failed to analyze. Please check the URL and try again." });
    } finally {
      setLoading(false);
    }
  };

  const rb = result?.risk_breakdown;
  const toNum = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const riskScores = rb
    ? [
        { label: "Speed", value: toNum(rb.speed_risk_score) },
        { label: "UX", value: toNum(rb.ux_risk_score) },
        { label: "SEO", value: toNum(rb.seo_risk_score) },
        { label: "Conversion", value: toNum(rb.conversion_risk_score) },
        { label: "Scaling", value: toNum(rb.scaling_risk_score) },
      ]
    : [];

  return (
    <main className="min-h-screen bg-grid flex flex-col items-center px-4 py-12 md:py-16">
      {/* Hero */}
      <header className="text-center mb-10 md:mb-14">
        <h1 className="text-4xl md:text-5xl font-bold gradient-text tracking-tight mb-2">
          Performance Intelligence
        </h1>
        <p className="text-[var(--muted)] text-lg max-w-md mx-auto">
          Analyze UI performance metrics and get actionable insights in seconds.
        </p>
      </header>

      {/* Input Card */}
      <div className="w-full max-w-xl rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 md:p-8 glow-ring shadow-xl">
        <label className="block text-sm font-medium text-[var(--muted)] mb-3">
          Website URL
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyzeWebsite()}
            className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3.5 text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all"
            disabled={loading}
          />
          <button
            onClick={analyzeWebsite}
            disabled={loading || !url.trim()}
            className="rounded-xl px-6 py-3.5 font-semibold text-[var(--background)] bg-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--accent)] transition-all shrink-0 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-[var(--background)] border-t-transparent rounded-full animate-spin" />
                Analyzing…
              </>
            ) : (
              "Analyze"
            )}
          </button>
        </div>
      </div>

      {/* Error state */}
      {result?.error && (
        <div className="mt-8 w-full max-w-xl rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-6 text-[var(--danger)]">
          {result.error}
        </div>
      )}

      {/* Results */}
      {result && result.summary && !result.error && (
        <div className="w-full max-w-3xl mt-10 space-y-6">
          {/* Summary Card */}
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 md:p-8 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <h2 className="text-2xl md:text-3xl font-bold text-[var(--foreground)]">
                {result.summary.overall_health_display}
              </h2>
              <span className="inline-flex items-center rounded-full border border-[var(--card-border)] bg-[var(--background)] px-4 py-1.5 text-sm font-medium text-[var(--accent)]">
                Risk: {result.summary.risk_level}
              </span>
            </div>
            <p className="text-[var(--muted)] leading-relaxed">
              {result.summary.executive_summary}
            </p>
          </div>

          {/* Risk Breakdown */}
          {riskScores.length > 0 && (
            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 md:p-8 shadow-xl">
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-5">
                Risk breakdown
              </h3>
              <div className="space-y-5">
                {riskScores.map(({ label, value }) => (
                  <RiskBar key={label} label={label} value={value} />
                ))}
              </div>
            </div>
          )}

          {/* Two-column: Issues & Actions */}
          <div className="grid md:grid-cols-2 gap-6">
            {Array.isArray(result.top_issues) && result.top_issues.length > 0 && (
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--danger)]" />
                  Top issues
                </h3>
                <ul className="space-y-3">
                  {result.top_issues.map((item: any, index: number) => (
                    <li
                      key={index}
                      className="flex gap-3 text-sm text-[var(--muted)] border-l-2 border-[var(--card-border)] pl-4 py-1 hover:border-[var(--danger)]/50 transition-colors"
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
                <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-xl">
                  <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
                    Prioritized actions
                  </h3>
                  <ul className="space-y-3">
                    {result.prioritized_actions.map((item: any, index: number) => (
                      <li
                        key={index}
                        className="flex gap-3 text-sm text-[var(--muted)] border-l-2 border-[var(--card-border)] pl-4 py-1 hover:border-[var(--success)]/50 transition-colors"
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
  );
}
