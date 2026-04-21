"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { setProjectReportJson } from "@/lib/projectClientStorage";
import { HeroDashboardPreview } from "@/components/home/HeroDashboardPreview";
import { UserAccountMenu } from "@/components/UserAccountMenu";

type HeroPreviewData = {
  summary?: {
    overall_health_score?: number;
    overall_health_display?: string;
    business_impact?: { impact_level?: string };
  };
  top_issues?: Array<{ issue: string }>;
};

function heroHealthColor(score0to100: number) {
  return score0to100 >= 80 ? "text-[#befe34]" : score0to100 >= 50 ? "text-amber-400" : "text-[#ff5c5c]";
}

function HeroPreview({ data }: { data: HeroPreviewData }) {
  const summary = data?.summary;
  const healthScore100 = typeof summary?.overall_health_score === "number"
    ? summary.overall_health_score
    : Number(summary?.overall_health_display) || 0;
  const healthDisplay10 = healthScore100 ? (healthScore100 / 10).toFixed(1) : "—";
  const revenueImpact = summary?.business_impact?.impact_level ?? "—";
  const topIssue = Array.isArray(data?.top_issues) && data.top_issues.length > 0
    ? data.top_issues[0].issue
    : "—";

  return (
    <div className="apm-glass-panel home-3d-lift rounded-2xl p-5">
      <div className="space-y-3">
        <div className="flex justify-between items-baseline gap-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Website health</span>
          <span className={`text-xl font-semibold tabular-nums ${heroHealthColor(healthScore100)}`}>
            {healthDisplay10} / 10
          </span>
        </div>
        <div className="flex justify-between gap-4 text-sm">
          <span className="text-zinc-500">Revenue impact</span>
          <span className="font-medium text-zinc-100">{revenueImpact}</span>
        </div>
        <div className="border-t border-white/10 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Top issue</span>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{topIssue}</p>
        </div>
      </div>
    </div>
  );
}

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

function validateUrl(input: string): { valid: boolean; message?: string } {
  const url = normalizeUrl(input);
  if (!url) return { valid: false, message: "Enter a URL." };
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (!host || host.length < 2) return { valid: false, message: "Enter a valid domain." };
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) && !/^localhost(?::\d+)?$/i.test(host)) {
      return { valid: false, message: "Enter a valid domain (e.g. example.com)." };
    }
    return { valid: true };
  } catch {
    return { valid: false, message: "Enter a valid URL." };
  }
}

const PROBLEM_CARDS = [
  { title: "Slow first screen", sub: "Users leave before they see value.", tone: "risk" as const },
  { title: "Delayed interaction", sub: "Every extra second costs conversions.", tone: "warn" as const },
  { title: "Instability", sub: "Jank and shifts erode trust.", tone: "muted" as const },
];

const PRIORITY_ROWS = [
  { fix: "Defer third-party analytics", recovery: "$4,200/mo", effort: "Low" },
  { fix: "Compress & prioritize hero media", recovery: "$3,100/mo", effort: "Medium" },
  { fix: "Split long tasks on main thread", recovery: "$2,050/mo", effort: "Medium" },
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

/** Header / hero “Analyze” — bring the user to the URL box and focus it so they can run immediately. */
function scrollToAnalyzerAndFocus() {
  const section = document.getElementById("analyzer");
  const input = document.getElementById("url-input") as HTMLInputElement | null;
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => {
    input?.focus({ preventScroll: true });
  }, 400);
}

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [performanceData, setPerformanceData] = useState<{ error?: string } | Record<string, unknown> | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [outputTab, setOutputTab] = useState<"competitive" | "revenue" | "fixes">("revenue");
  const isLoggedIn = status === "authenticated" && !!session?.user;

  const analyzePerformance = async () => {
    const normalized = normalizeUrl(url);
    const validation = validateUrl(url);
    if (!validation.valid) {
      setUrlError(validation.message ?? "Invalid URL.");
      return;
    }
    setUrlError(null);

    setLoading(true);
    setAnalysisResult(null);
    setPerformanceData(null);

    try {
      const response = await fetch(
        `/api/analyze?url=${encodeURIComponent(normalized)}&revenue=0&mobileShare=100&industry=general`,
        { credentials: "include" }
      );
      const data = await response.json();
      if (!response.ok) {
        setPerformanceData({ error: data?.error || `Request failed (${response.status})` });
        return;
      }
      if (data.userAuthenticated) {
        setPerformanceData(data);
        setAnalysisResult(data);
        const projectId =
          typeof data.projectId === "string" && data.projectId.length > 0
            ? data.projectId
            : (() => {
                try {
                  const host = new URL(normalized).hostname.replace(/\./g, "-");
                  return `${host}-${Date.now().toString(36)}`;
                } catch {
                  return `project-${Date.now().toString(36)}`;
                }
              })();
        const payload = {
          url: normalized,
          data,
          analyzedAt: new Date().toISOString(),
        };
        try {
          setProjectReportJson(projectId, JSON.stringify(payload));
        } catch {
          /* quota / private mode */
        }
        // `run` changes on every analyze so the dashboard remounts its storage effect (same projectId URL otherwise skips reload).
        router.push(
          `/dashboard/${projectId}?run=${encodeURIComponent(payload.analyzedAt)}`
        );
      } else {
        try {
          localStorage.setItem("pendingAnalysisResult", JSON.stringify({ url: normalized, data }));
        } catch {
          /* ignore */
        }
        setPerformanceData(null);
        setAnalysisResult(null);
        router.push("/report");
      }
    } catch {
      setPerformanceData({ error: "Failed to analyze. Please check the URL and try again." });
    } finally {
      setLoading(false);
    }
  };

  const NavLinks = ({ onNav }: { onNav?: () => void }) => (
    <>
      <button
        type="button"
        onClick={() => {
          scrollToAnalyzerAndFocus();
          onNav?.();
        }}
        className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[#befe34]"
      >
        Analyze
      </button>
      {isLoggedIn ? (
        <Link
          href="/dashboard"
          onClick={onNav}
          className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[#befe34]"
        >
          Dashboard
        </Link>
      ) : (
        <Link
          href="/login?callbackUrl=/dashboard"
          onClick={onNav}
          className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[#befe34]"
        >
          Dashboard
        </Link>
      )}
      {isLoggedIn ? (
        <Link
          href="/dashboard#performance-change"
          onClick={onNav}
          className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[#befe34]"
        >
          History
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            setShowAuthModal(true);
            onNav?.();
          }}
          className="rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-[#befe34]"
        >
          History
        </button>
      )}
    </>
  );

  return (
    <div className="home-premium home-apm home-apm-bg min-h-screen text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-50">
            Performance Intelligence
          </Link>
          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
            <nav className="hidden items-center gap-0.5 md:flex">
              <NavLinks />
            </nav>
            <UserAccountMenu variant="header" />
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-zinc-100 md:hidden hover:border-[#befe34]/35 hover:bg-[#befe34]/10"
              aria-label="Open menu"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/70" onClick={() => setMobileNavOpen(false)} aria-label="Close" />
          <div className="absolute right-0 top-0 flex h-full w-[min(100%,280px)] flex-col border-l border-white/10 bg-zinc-950/95 p-6 backdrop-blur-xl">
            <div className="mb-6 flex justify-end">
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-[#befe34]"
                aria-label="Close menu"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              <NavLinks onNav={() => setMobileNavOpen(false)} />
            </nav>
          </div>
        </div>
      )}

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 lg:pt-14">
        {/* Hero */}
        <section id="hero" className="grid scroll-mt-24 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <h1 className="text-3xl font-bold leading-[1.12] tracking-tight text-zinc-50 sm:text-4xl lg:text-[2.65rem] lg:leading-[1.08]">
              You are losing{" "}
              <span className="text-[#befe34]" style={{ textShadow: "0 0 40px rgba(190,254,52,0.25)" }}>
                revenue
              </span>{" "}
              due to slow performance
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-[17px]">
              We show exactly where, why, and what to fix — in business terms, not technical noise.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => scrollToAnalyzerAndFocus()}
                className="apm-btn-primary inline-flex min-h-[48px] items-center justify-center rounded-xl px-6 text-sm transition duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#befe34]/50"
              >
                Analyze my site
              </button>
              <Link
                href="#output-preview"
                className="apm-btn-ghost inline-flex min-h-[48px] items-center justify-center rounded-xl px-6 text-sm font-semibold transition duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/20"
              >
                See example report
              </Link>
            </div>
          </div>
          <div className="lg:pl-4">
            <HeroDashboardPreview />
          </div>
        </section>

        {/* Problem */}
        <section id="problem" className="mt-24 scroll-mt-24 border-t border-white/10 pt-16">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
            Most founders don&apos;t know where performance is hurting revenue
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {PROBLEM_CARDS.map((c) => (
              <div key={c.title} className="apm-glass-panel home-3d-lift rounded-2xl p-5">
                <div
                  className={`mb-3 h-1 w-10 rounded-full shadow-[0_0_12px_rgba(255,80,80,0.4)] ${
                    c.tone === "risk"
                      ? "bg-[#ff5c5c]"
                      : c.tone === "warn"
                        ? "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.35)]"
                        : "bg-zinc-600"
                  }`}
                />
                <h3 className="text-base font-semibold text-zinc-50">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{c.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Solution flow */}
        <section id="solution" className="mt-24 scroll-mt-24 border-t border-white/10 pt-16">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">Turn performance into business decisions</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">A clear path from signal to action.</p>
          <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-center">
            {(
              [
                { label: "Metrics", sub: "Lighthouse-backed signals", step: 1 },
                { label: "Intelligence", sub: "Risk & attribution", step: 2 },
                { label: "Revenue impact", sub: "Exposure in $/mo", step: 3 },
                { label: "Fixes", sub: "Prioritized by ROI", step: 4 },
              ] as const
            ).map((item, i, arr) => (
              <div key={item.label} className="flex min-w-0 flex-1 items-center gap-2">
                <div className="apm-glass-panel home-3d-lift flex min-h-[112px] w-full min-w-0 flex-col rounded-2xl p-4">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#befe34]/85">Step {item.step}</span>
                  <p className="mt-2 text-base font-semibold text-zinc-50">{item.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">{item.sub}</p>
                </div>
                {i < arr.length - 1 && (
                  <div className="hidden shrink-0 items-center justify-center text-zinc-600 lg:flex" aria-hidden>
                    <svg className="h-5 w-5 text-[#befe34]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Output preview */}
        <section id="output-preview" className="mt-24 scroll-mt-24 border-t border-white/10 pt-16">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">What you get</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Representative layout — your report reflects your URL and traffic.</p>
          <div className="apm-glass-panel home-3d-lift mt-8 rounded-2xl p-1">
            <div className="flex flex-wrap gap-1 rounded-t-xl border-b border-white/10 bg-black/30 p-2">
              {(
                [
                  { id: "competitive" as const, label: "Competitive analysis" },
                  { id: "revenue" as const, label: "Revenue exposure" },
                  { id: "fixes" as const, label: "Priority fixes" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setOutputTab(tab.id)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium transition duration-300 ${
                    outputTab === tab.id
                      ? "bg-[#befe34] font-semibold text-zinc-950 shadow-[0_0_24px_rgba(190,254,52,0.35)]"
                      : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="p-6 sm:p-8">
              {outputTab === "competitive" && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-300">
                    Factor-level positioning vs competitors — where you&apos;re behind, even, or ahead — with plain-language consequences.
                  </p>
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.04] text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          <th className="px-4 py-3">Factor</th>
                          <th className="px-4 py-3">Position</th>
                          <th className="px-4 py-3">Impact</th>
                        </tr>
                      </thead>
                      <tbody className="text-zinc-300">
                        <tr className="border-b border-white/5">
                          <td className="px-4 py-3">First impression speed</td>
                          <td className="px-4 py-3 text-amber-400">Behind</td>
                          <td className="px-4 py-3">High</td>
                        </tr>
                        <tr className="border-b border-white/5">
                          <td className="px-4 py-3">Interaction readiness</td>
                          <td className="px-4 py-3 text-zinc-400">Similar</td>
                          <td className="px-4 py-3">Medium</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3">Drop-off risk</td>
                          <td className="px-4 py-3 text-[#befe34]">Ahead</td>
                          <td className="px-4 py-3">Low</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {outputTab === "revenue" && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ff5c5c]">Estimated exposure</p>
                    <p className="apm-neon-red mt-2 text-3xl font-bold tabular-nums">$12,400</p>
                    <p className="mt-1 text-xs text-zinc-500">per month at risk · illustrative</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                    <p className="text-xs font-medium text-zinc-400">Leak by stage</p>
                    <ul className="mt-3 space-y-2 text-sm">
                      <li className="flex justify-between">
                        <span className="text-zinc-400">Visual entry</span>
                        <span className="font-medium text-amber-400">$4,800</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-zinc-400">Interaction</span>
                        <span className="font-medium text-amber-400">$5,200</span>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-zinc-400">Trust &amp; stability</span>
                        <span className="font-medium text-zinc-300">$2,400</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
              {outputTab === "fixes" && (
                <div>
                  <p className="text-sm text-zinc-300">
                    Ranked by recoverable revenue and effort — so you ship what pays back first.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {["Defer blocking scripts", "Optimize LCP asset", "Trim main-thread work"].map((t, idx) => (
                      <li
                        key={t}
                        className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm"
                      >
                        <span className="font-medium text-zinc-50">
                          {idx + 1}. {t}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-[#befe34]">Open fix guide</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Priority fixes hook */}
        <section id="priority-fixes" className="mt-24 scroll-mt-24 border-t border-white/10 pt-16">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">Know exactly what to fix first</h2>
          <div className="apm-glass-panel mt-8 overflow-hidden rounded-2xl">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04] text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 sm:px-6">Fix</th>
                  <th className="px-4 py-3 sm:px-6">Revenue recovery</th>
                  <th className="px-4 py-3 sm:px-6">Effort</th>
                </tr>
              </thead>
              <tbody>
                {PRIORITY_ROWS.map((row) => (
                  <tr key={row.fix} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-4 text-zinc-200 sm:px-6">{row.fix}</td>
                    <td
                      className="px-4 py-4 font-medium tabular-nums text-[#befe34] sm:px-6"
                      style={{ textShadow: "0 0 20px rgba(190,254,52,0.2)" }}
                    >
                      {row.recovery}
                    </td>
                    <td className="px-4 py-4 text-zinc-400 sm:px-6">{row.effort}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-white/10 px-4 py-3 text-xs text-zinc-500 sm:px-6">
              Illustrative values — your analysis produces project-specific fixes and dollar ranges.
            </p>
          </div>
        </section>

        {/* CTA + analyzer */}
        <section id="analyzer" className="mt-24 scroll-mt-28">
          <div className="apm-bento-shell home-3d-lift rounded-[1.25rem] p-6 sm:p-10">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">See how much revenue you&apos;re losing</h2>
            <p className="mt-2 text-sm text-zinc-400">Run a mobile-first audit. Results open in your dashboard or guest report.</p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-stretch">
              <div className="min-w-0 flex-1">
                <label htmlFor="url-input" className="sr-only">
                  Website URL
                </label>
                <input
                  id="url-input"
                  type="text"
                  inputMode="url"
                  placeholder="https://yoursite.com"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (loading || !url.trim()) return;
                    void analyzePerformance();
                  }}
                  className={`min-h-[52px] w-full rounded-xl border bg-black/40 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#befe34]/30 ${urlError ? "border-red-500/50" : "border-white/15 focus:border-[#befe34]/50"}`}
                  disabled={loading}
                />
                {urlError && (
                  <p className="mt-2 text-xs text-[#ff5c5c]" role="alert">
                    {urlError}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={analyzePerformance}
                disabled={loading || !url.trim()}
                className="apm-btn-primary inline-flex min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-xl px-8 text-sm font-semibold transition duration-300 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#befe34]/50"
              >
                {loading ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
                    Analyzing…
                  </>
                ) : (
                  "Run analysis"
                )}
              </button>
            </div>
            {loading && (
              <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-[#befe34]" />
                Running analysis…
              </p>
            )}
            {!loading &&
              analysisResult &&
              analysisResult.summary != null &&
              !("error" in analysisResult && analysisResult.error) && (
              <div className="mt-8 max-w-md">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Snapshot</p>
                <HeroPreview data={analysisResult as HeroPreviewData} />
              </div>
            )}
          </div>

          {typeof performanceData?.error === "string" && performanceData.error ? (
            <div className="mt-6 rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-300">
              {performanceData.error}
            </div>
          ) : null}
        </section>
      </main>

      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          onClick={() => setShowAuthModal(false)}
        >
          <div
            className="apm-glass-panel relative w-full max-w-md rounded-2xl p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 hover:bg-white/5 hover:text-[#befe34]"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 id="auth-modal-title" className="pr-10 text-xl font-semibold text-zinc-50">
              Track performance over time
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Create an account to save history and catch regressions early.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="apm-btn-primary inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium"
              >
                Sign up
              </Link>
              <Link
                href="/login"
                className="apm-btn-ghost inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2.5 text-sm font-medium"
              >
                Log in
              </Link>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="min-h-[44px] rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
              >
                Continue as guest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
