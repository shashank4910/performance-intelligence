"use client";

/**
 * Competitive Position — the full CTA-driven competitor comparison flow
 * (previously inlined in app/dashboard/[projectId]/page.tsx).
 *
 * This component owns:
 *   - The "Compare with Competitors" CTA + modal
 *   - The competitor-analysis fetch
 *   - The "what this means" language-generation fetch
 *   - The decision/why/business-impact/actions brief
 *
 * Inputs are the StoredProject that every dashboard page already loads, so
 * there is no duplicate calculation — the same health score, baseline
 * revenue, and leak figures used on the decision layer also drive this
 * drilldown surface.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardDisclosure } from "@/components/dashboard/DashboardCollapsibleSection";
import UpgradeModal from "@/components/UpgradeModal";
import { buildCompetitorDecisionIntel } from "@/lib/competitorDecisionIntel";
import {
  buildWhatThisMeansSignals,
  stripWhatThisMeansHeader,
} from "@/lib/whatThisMeansSignals";
import { buildWhatThisMeansFallback } from "@/lib/whatThisMeansFallback";
import {
  absoluteStateFromHealth10,
  actionableLabelForSnapshotRow,
  dualLayerRecommendedAction,
  getPrimaryCompetitorIssue,
  getSnapshotPosition,
  healthScore10FromOverall100,
  relativeVsCompetitor,
  rowBusinessImpact,
  snapshotNarrativeCopy,
  sortComparisonSnapshotRows,
  type AbsoluteHealthState,
  type ActionableFactorLabel,
  type CompetitorAnalysisOutput,
  type ComparisonSnapshotRow,
  type RecommendedCompetitorAction,
  type RelativeVsCompetitor,
} from "@/engine/competitorAnalysis";
import {
  isProUser,
  overallHealth100,
  type StoredProject,
} from "@/lib/dashboardProject";

const DASH_SURFACE =
  "rounded-2xl border border-white/[0.08] bg-[#131b2e]/75 shadow-[0_0_0_1px_rgba(57,255,20,0.04),0_24px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl ring-1 ring-white/[0.03]";

const SNAPSHOT_FACTOR_LABEL: Record<string, string> = {
  "First impression speed": "First impression speed",
  "Interaction readiness": "Interaction delay",
  "Interaction delay": "Interaction delay",
  "User drop-off risk": "Layout stability",
  "Layout stability": "Layout stability",
  "Backend response": "Backend response",
};

function isUserBehindCompetitor(result: CompetitorAnalysisOutput): boolean {
  if (result.mode === "head_to_head") return result.comparison?.status === "slower";
  return (result.competitor_summary?.faster_competitors ?? 0) > 0;
}

function isUserAheadCompetitor(result: CompetitorAnalysisOutput): boolean {
  if (result.mode === "head_to_head") return result.comparison?.status === "faster";
  const s = result.competitor_summary;
  if (!s) return false;
  return s.faster_competitors === 0 && s.slower_competitors > 0;
}

function revenueAtRiskImpactLabel(monthlyRisk: number): "low impact" | "moderate impact" | "high impact" {
  if (monthlyRisk < 50) return "low impact";
  if (monthlyRisk <= 200) return "moderate impact";
  return "high impact";
}

function formatCompetitorActionMoney(amt: number): string {
  if (!Number.isFinite(amt) || amt <= 0) return "(~$0/mo)";
  const rounded = Math.round(amt);
  return `(~$${rounded.toLocaleString("en-US")}/mo)`;
}

function competitorMonetizationActionLine(item: { action: string; estimated_recovery: number }): string {
  const m = formatCompetitorActionMoney(item.estimated_recovery);
  const a = item.action ?? "";
  if (a.includes("Maintain fast")) {
    return `First screen is slow → users wait before seeing value ${m}`;
  }
  if (a.includes("Reduce interaction")) {
    return `Interactions feel delayed → users drop during actions ${m}`;
  }
  if (a.includes("Prevent regressions")) {
    return `Performance keeps slipping → users hit slower flows over time ${m}`;
  }
  return `Experience lags → revenue walks away ${m}`;
}

function businessImpactLine(behind: boolean, riskNum: number): string {
  if (behind) {
    return "Attention shifts to faster sites first, so conversions skew away before your value lands.";
  }
  if (riskNum <= 0) {
    return "Speed is not causing revenue loss right now.";
  }
  return "Speed is not causing revenue loss right now; dollar estimates are directional — keep the gap from widening.";
}

function pickDualLayerHeadline(
  relative: RelativeVsCompetitor,
  absolute: AbsoluteHealthState,
  intel: { decisionHeadline: string },
  snapshotHeadline: string | null
): string {
  if (relative === "Behind") return "You are losing users to faster competitors";
  if (relative === "Similar" && absolute === "POOR") {
    return "Both sites are slow — this is holding back conversions";
  }
  if (relative === "Ahead" && absolute === "POOR") {
    return "You're ahead of this competitor, but your site is still slow";
  }
  return snapshotHeadline ?? intel.decisionHeadline;
}

function causalOneLine(dominant: ActionableFactorLabel, behind: boolean): string {
  if (dominant === "First impression speed") {
    return behind
      ? "slow first paint → visitors leave early → sessions go to faster sites"
      : "fast first paint → attention holds → you keep the comparative win";
  }
  if (dominant === "Interaction delay") {
    return behind
      ? "delayed taps → tasks stall → users abandon mid-flow"
      : "responsive taps → faster interaction keeps users engaged";
  }
  return behind
    ? "layout shifts on key steps → rework → signup and checkout abandon"
    : "stable layout → users finish steps without rework";
}

const FACTOR_GROUP_ORDER = ["speed", "interaction", "layout stability"] as const;

function factorGroupLabel(factor: string): (typeof FACTOR_GROUP_ORDER)[number] | null {
  if (factor === "First impression speed" || factor === "Backend response") return "speed";
  if (factor === "Interaction readiness") return "interaction";
  if (factor === "User drop-off risk") return "layout stability";
  return null;
}

function collectMajorBehindGapLabels(rows: ComparisonSnapshotRow[]): (typeof FACTOR_GROUP_ORDER)[number][] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (getSnapshotPosition(row) !== "Behind") continue;
    const imp = rowBusinessImpact(row);
    if (imp !== "High" && imp !== "Medium") continue;
    const g = factorGroupLabel(row.factor);
    if (g) seen.add(g);
  }
  return FACTOR_GROUP_ORDER.filter((k) => seen.has(k));
}

function formatFactorList(list: readonly string[]): string {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0]!;
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

function sentence2UxForFactors(labels: readonly (typeof FACTOR_GROUP_ORDER)[number][]): string {
  const a = labels.includes("speed");
  const b = labels.includes("layout stability");
  const c = labels.includes("interaction");
  if (a && b && c) {
    return "People wait longer for content to show, the screen shifts while they read or tap, and simple actions feel slow.";
  }
  if (a && b) {
    return "People wait longer for content to show, and the screen shifts while they use the page.";
  }
  if (a && c) {
    return "People wait longer for content to show, and taps and scrolls feel slow.";
  }
  if (b && c) {
    return "The screen shifts while people act, and taps and scrolls feel slow.";
  }
  if (a) return "People wait longer for content to show.";
  if (b) return "The screen shifts while people read or tap.";
  if (c) return "Taps and scrolls feel slow.";
  return "";
}

function whyForMajorBehindGaps(rows: ComparisonSnapshotRow[]): string | null {
  const labels = collectMajorBehindGapLabels(rows);
  if (labels.length === 0) return null;
  const list = formatFactorList(labels);
  const s1 = `You are behind this competitor on ${list}.`;
  const s2 = sentence2UxForFactors(labels);
  const s3 = "That leads to more drop-offs, abandoned sessions, and fewer conversions.";
  return `${s1} ${s2} ${s3}`;
}

function decisionWhyBlock(
  ra: RecommendedCompetitorAction,
  rows: ComparisonSnapshotRow[],
  relative: RelativeVsCompetitor,
  absolute: AbsoluteHealthState
): { decision: string; why: string } {
  if (ra === "IMPROVE") {
    return {
      decision: "IMPROVE — strengthen your site’s performance",
      why: "You perform better than this competitor, but overall performance is still weak. Users may still leave before completing actions.",
    };
  }
  if (ra === "MONITOR") {
    if (rows.length === 0) {
      return {
        decision: "MONITOR — no immediate action required",
        why: "Run the comparison again to fill the snapshot table. The decision will match relative position and your site health once data is available.",
      };
    }
    return {
      decision: "MONITOR — no immediate action required",
      why: "You are even or ahead in this comparison and your overall health is strong enough that speed is not the urgent issue here. Check again after large site changes.",
    };
  }
  if (ra === "PRIORITIZE") {
    if (relative !== "Ahead") {
      const gapWhy = whyForMajorBehindGaps(rows);
      if (gapWhy) {
        return {
          decision: "PRIORITIZE — schedule speed work soon",
          why: gapWhy,
        };
      }
    }
    return {
      decision: "PRIORITIZE — schedule speed work soon",
      why:
        relative === "Ahead"
          ? "You lead this comparison, but your overall health is only moderate. Schedule fixes before competitors close the gap."
          : "You are behind where Importance is medium or lower. Users still wait more than on the competitor, so delays add up and some people leave before they finish. Plan this work before you spend more on traffic.",
    };
  }
  if (relative === "Similar" && absolute === "POOR") {
    const gapWhy = whyForMajorBehindGaps(rows);
    return {
      decision: "ACT NOW — improve the experience on both sides",
      why:
        gapWhy ??
        "Neither site is fast enough in absolute terms. Users still wait and many leave before they convert, so fix the slowest steps first.",
    };
  }
  const gapWhyAct = whyForMajorBehindGaps(rows);
  return {
    decision: "ACT NOW — fix the highest-importance gap first",
    why:
      gapWhyAct ??
      "You are behind this competitor in this comparison. Users wait longer at the start or during actions, so more sessions end before they buy or sign up. Fix this gap first, then run the comparison again.",
  };
}

function decisionOneLine(
  ra: RecommendedCompetitorAction,
  rows: ComparisonSnapshotRow[],
  relative: RelativeVsCompetitor,
  absolute: AbsoluteHealthState
): string {
  return decisionWhyBlock(ra, rows, relative, absolute).decision;
}

function whyOneLine(
  ra: RecommendedCompetitorAction,
  rows: ComparisonSnapshotRow[],
  relative: RelativeVsCompetitor,
  absolute: AbsoluteHealthState
): string {
  return decisionWhyBlock(ra, rows, relative, absolute).why;
}

function businessImpactCell(biz: "High" | "Medium" | "Low"): { icon: string; label: string } {
  if (biz === "High") return { icon: "🔥", label: "High" };
  if (biz === "Medium") return { icon: "⚠️", label: "Medium" };
  return { icon: "○", label: "Low" };
}

function ComparisonSnapshotTable({
  rows,
  showCompetitorAvgNote,
  compact,
  dominantLabel,
  comparedTo,
  summaryLine,
}: {
  rows: ComparisonSnapshotRow[];
  showCompetitorAvgNote: boolean;
  compact?: boolean;
  dominantLabel: ActionableFactorLabel;
  comparedTo: string;
  summaryLine?: string | null;
}) {
  const cell = compact ? "px-2 py-1.5 sm:px-3" : "px-3 py-2.5 sm:px-4";
  const head = compact ? "px-2 py-2 sm:px-3 text-xs" : "px-3 py-3 sm:px-4";
  const text = compact ? "text-xs" : "text-sm";

  const sorted = sortComparisonSnapshotRows(rows);
  const primary = getPrimaryCompetitorIssue(sorted);
  const primaryFactorDisplay = primary ? SNAPSHOT_FACTOR_LABEL[primary.factor] ?? primary.factor : null;

  const highlightFactor =
    primary?.factor ??
    sorted.find((r) => actionableLabelForSnapshotRow(r, sorted) === dominantLabel)?.factor ??
    sorted[0]?.factor;

  return (
    <div className={compact ? "mt-3" : "mt-5"}>
      <p className={`mb-2 text-[var(--foreground)] ${compact ? "text-xs" : "text-sm"}`}>
        Compared to: {comparedTo}
      </p>
      {summaryLine ? (
        <p className={`mb-3 text-[var(--muted)] ${compact ? "text-xs" : "text-sm"}`}>{summaryLine}</p>
      ) : null}
      {primaryFactorDisplay ? (
        <p
          className={`mb-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 font-semibold text-[var(--foreground)] ${compact ? "text-xs" : "text-sm"}`}
        >
          Biggest issue: {primaryFactorDisplay} — high impact on conversions
        </p>
      ) : !summaryLine ? (
        <p className={`mb-3 text-[var(--muted)] ${compact ? "text-xs" : "text-sm"}`}>
          No gap behind competitors on these factors.
        </p>
      ) : null}
      {showCompetitorAvgNote && (
        <p className={`mb-2 text-[var(--muted)] ${compact ? "text-[11px]" : "text-xs"}`}>
          Competitor baseline: average of sites in this comparison.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className={`w-full min-w-[480px] ${text}`}>
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.04] text-left">
              <th className={`${head} font-semibold text-[var(--foreground)]`}>Factor</th>
              <th className={`${head} font-semibold text-[var(--foreground)]`}>Position</th>
              <th className={`${head} font-semibold text-[var(--foreground)]`}>Importance</th>
              <th className={`${head} font-semibold text-[var(--foreground)]`}>Why it matters</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const factorLabel = SNAPSHOT_FACTOR_LABEL[row.factor] ?? row.factor;
              const pos =
                row.position === "Behind"
                  ? "Behind"
                  : row.position === "Ahead"
                    ? "Ahead"
                    : row.position === "Similar"
                      ? "Similar"
                      : "Similar";
              const biz = rowBusinessImpact(row);
              const bizCell = businessImpactCell(biz);
              const isHighlight = highlightFactor === row.factor;
              return (
                <tr
                  key={row.factor}
                  className={`border-b border-white/5 last:border-0 ${
                    isHighlight ? "bg-[#befe34]/15 ring-2 ring-inset ring-amber-400/40" : ""
                  }`}
                >
                  <td className={`${cell} text-[var(--foreground)]`}>{factorLabel}</td>
                  <td className={`${cell} text-[var(--foreground)]`}>{pos}</td>
                  <td className={`${cell} text-[var(--foreground)] tabular-nums`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className={biz === "Low" ? "text-[var(--muted)]" : ""}>
                        {bizCell.icon}
                      </span>
                      <span>{bizCell.label}</span>
                    </span>
                  </td>
                  <td
                    className={`${cell} max-w-[280px] text-[var(--muted)] ${compact ? "text-[11px] leading-snug" : "text-xs leading-snug sm:text-sm"}`}
                  >
                    {row.why_it_matters?.trim() || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type CompetitivePositionPanelProps = {
  projectId: string | null | undefined;
  stored: StoredProject;
};

export default function CompetitivePositionPanel({ projectId, stored }: CompetitivePositionPanelProps) {
  const data = stored.data;
  const [competitorModalOpen, setCompetitorModalOpen] = useState(false);
  const [competitorUrlsText, setCompetitorUrlsText] = useState("");
  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [competitorError, setCompetitorError] = useState<string | null>(null);
  const [competitorResult, setCompetitorResult] = useState<CompetitorAnalysisOutput | null>(
    data.competitive_analysis ?? null
  );
  const [competitorWhatThisMeans, setCompetitorWhatThisMeans] = useState<string | null>(null);
  const [competitorWhatThisMeansLoading, setCompetitorWhatThisMeansLoading] = useState(false);
  const [competitorBriefOpen, setCompetitorBriefOpen] = useState(false);
  const [demoProUnlocked, setDemoProUnlocked] = useState(false);
  const [priorityFixesUpgradeOpen, setPriorityFixesUpgradeOpen] = useState(false);

  const healthScore100 = overallHealth100(stored);
  const proUser = isProUser(stored, demoProUnlocked);
  const priorityFixesHref = projectId ? `/dashboard/${projectId}#action-priority-list` : "#";

  useEffect(() => {
    if (!competitorResult) setCompetitorBriefOpen(false);
  }, [competitorResult]);

  useEffect(() => {
    if (!competitorResult) {
      setCompetitorWhatThisMeans(null);
      setCompetitorWhatThisMeansLoading(false);
      return;
    }
    const phraseSeed = stored.url || "";
    const signals = buildWhatThisMeansSignals(competitorResult);
    if (!signals) {
      setCompetitorWhatThisMeans(null);
      setCompetitorWhatThisMeansLoading(false);
      return;
    }
    const ac = new AbortController();
    setCompetitorWhatThisMeansLoading(true);
    setCompetitorWhatThisMeans(null);
    fetch("/api/competitor-what-this-means", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...signals, phrase_seed: phraseSeed }),
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("what-this-means failed");
        const payload = (await res.json()) as { text?: string };
        return payload.text ?? "";
      })
      .then((text) => {
        if (ac.signal.aborted) return;
        const t = typeof text === "string" ? text.trim() : "";
        setCompetitorWhatThisMeans(t ? t : buildWhatThisMeansFallback(signals, phraseSeed));
      })
      .catch(() => {
        if (!ac.signal.aborted) setCompetitorWhatThisMeans(buildWhatThisMeansFallback(signals, phraseSeed));
      })
      .finally(() => {
        if (!ac.signal.aborted) setCompetitorWhatThisMeansLoading(false);
      });
    return () => ac.abort();
  }, [competitorResult, stored.url]);

  const runCompetitorAnalysis = async () => {
    setCompetitorError(null);
    setCompetitorLoading(true);
    try {
      const rawCandidates = competitorUrlsText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);

      const normalized: string[] = [];
      for (const c of rawCandidates) {
        let input = c;
        if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
        let u: URL;
        try {
          u = new URL(input);
        } catch {
          setCompetitorError("Enter valid competitor URLs.");
          return;
        }
        const host = u.hostname;
        const hostOk =
          !!host &&
          host.length >= 2 &&
          (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || /^localhost(?::\d+)?$/i.test(host));
        if (!hostOk) {
          setCompetitorError("Enter valid competitor URLs.");
          return;
        }
        normalized.push(u.toString());
      }

      if (normalized.length === 0) {
        setCompetitorError("Enter at least one competitor URL.");
        return;
      }
      const targetUrl = stored.url;
      if (!targetUrl) {
        setCompetitorError("Missing analyzed URL. Please run analysis again.");
        return;
      }

      const baselineParam =
        typeof data.baselineRevenueForCompetitorAnalysis === "number" &&
        Number.isFinite(data.baselineRevenueForCompetitorAnalysis)
          ? `&baselineRevenue=${encodeURIComponent(data.baselineRevenueForCompetitorAnalysis)}`
          : "";
      const health10 = healthScore100 > 0 ? healthScore10FromOverall100(healthScore100) : 5;
      const healthParam = `&healthScore=${encodeURIComponent(String(health10))}`;
      const qs = `/api/competitor-analysis?url=${encodeURIComponent(targetUrl)}&competitorUrls=${encodeURIComponent(normalized.join(","))}${baselineParam}${healthParam}`;
      const res = await fetch(qs);
      let payload: { competitive_analysis?: CompetitorAnalysisOutput | null; error?: string } = {};
      try {
        payload = await res.json();
      } catch {
        setCompetitorError(
          res.ok ? "Invalid response from server. Try again." : `Request failed (${res.status}). Try again.`
        );
        return;
      }
      if (!res.ok) {
        setCompetitorError(
          typeof payload?.error === "string" ? payload.error : `Failed to compare competitors (${res.status}).`
        );
        return;
      }
      const nextResult = payload?.competitive_analysis ?? null;
      if (nextResult == null) {
        setCompetitorError("We couldn't generate competitor insights for those URLs. Please try again.");
        return;
      }
      setCompetitorResult(nextResult);
      setCompetitorModalOpen(false);
    } catch {
      setCompetitorError("Failed to compare competitors. Please try again.");
    } finally {
      setCompetitorLoading(false);
    }
  };

  const brief = useMemo(() => {
    if (!competitorResult) return null;
    const intel = buildCompetitorDecisionIntel(competitorResult);
    const behind = isUserBehindCompetitor(competitorResult);
    const ahead = isUserAheadCompetitor(competitorResult);
    const overallPoor = healthScore100 > 0 && healthScore100 < 50;
    const health10 = healthScore100 > 0 ? healthScore10FromOverall100(healthScore100) : 5;
    const absolute = absoluteStateFromHealth10(health10);
    const relative = relativeVsCompetitor(competitorResult);
    const globalCompetitorNote =
      ahead && overallPoor && !(relative === "Ahead" && absolute === "POOR")
        ? "You are faster than competitors, but overall performance is still poor."
        : null;
    const monthlyRisk = competitorResult.competitive_risk?.monthly_risk;
    const riskNum = typeof monthlyRisk === "number" && Number.isFinite(monthlyRisk) ? Math.max(0, monthlyRisk) : 0;
    const revenueImpact = revenueAtRiskImpactLabel(riskNum);
    const snapshotRows = Array.isArray(competitorResult.comparison_snapshot)
      ? competitorResult.comparison_snapshot
      : [];
    const comparedTo =
      (competitorResult.comparison_rows ?? [])
        .map((r) => r.site)
        .filter((s) => s && s.toLowerCase() !== "your site")
        .join(", ") || "Competitor";
    const snapshotNarrative = snapshotNarrativeCopy(snapshotRows, stored.url || "");
    const headline = pickDualLayerHeadline(relative, absolute, intel, snapshotNarrative.headline);
    const dominantActionable =
      (competitorResult.dominant_driver?.label ?? "First impression speed") as ActionableFactorLabel;
    const actionPlan = (Array.isArray(competitorResult.action_plan) ? competitorResult.action_plan : []).slice(0, 3);
    const recommended: RecommendedCompetitorAction = dualLayerRecommendedAction(relative, absolute);
    const decisionText = decisionOneLine(recommended, snapshotRows, relative, absolute);
    const whyText = whyOneLine(recommended, snapshotRows, relative, absolute);
    const showPoorCtas = absolute === "POOR";
    const priorityCtaLabel = recommended === "MONITOR" ? "View higher priority fixes" : "See Priority Fixes";
    return {
      intel,
      behind,
      globalCompetitorNote,
      riskNum,
      revenueImpact,
      snapshotRows,
      comparedTo,
      snapshotNarrative,
      headline,
      dominantActionable,
      actionPlan,
      recommended,
      decisionText,
      whyText,
      showPoorCtas,
      priorityCtaLabel,
    };
  }, [competitorResult, healthScore100, stored.url]);

  return (
    <>
      <section className={`scroll-mt-8 ${DASH_SURFACE} p-5 sm:p-6`}>
        <h2 className="text-lg font-bold tracking-tight text-[#dae2fd]">Competitive Position</h2>

        {!competitorResult && (
          <>
            <p className="mt-1 text-sm text-[var(--muted)]">See how your performance compares to competitors</p>
            <button
              type="button"
              onClick={() => {
                setCompetitorModalOpen(true);
                setCompetitorError(null);
                setCompetitorUrlsText("");
              }}
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-[#CCFF33] px-5 py-3 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(57,255,20,0.2)] transition hover:scale-[1.01] active:scale-[0.99]"
            >
              Compare with Competitors (Free)
            </button>
            {competitorError && (
              <p className="mt-3 text-xs text-red-400" role="alert">
                {competitorError}
              </p>
            )}
          </>
        )}

        {competitorResult && brief && (
          <>
            <div className="mt-4">
              <h3 className="text-lg font-bold leading-snug tracking-tight text-[#dae2fd]">{brief.headline}</h3>
              {brief.globalCompetitorNote && (
                <p className="mt-2 text-sm leading-snug text-amber-300/95">{brief.globalCompetitorNote}</p>
              )}
            </div>

            <DashboardDisclosure
              open={competitorBriefOpen}
              onToggle={() => setCompetitorBriefOpen((o) => !o)}
              className="mt-5"
              summary={
                <p className="text-sm leading-snug text-slate-400">
                  Snapshot, interpretation, decision, business impact, and actions — open when you want the full
                  competitive brief.
                </p>
              }
            >
              {brief.snapshotRows.length > 0 ? (
                <div className="mt-5">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Snapshot</h4>
                  <ComparisonSnapshotTable
                    rows={brief.snapshotRows}
                    compact
                    dominantLabel={brief.dominantActionable}
                    comparedTo={brief.comparedTo}
                    summaryLine={brief.snapshotNarrative.summaryLine}
                    showCompetitorAvgNote={
                      competitorResult.mode === "multi" && (competitorResult.comparison_rows?.length ?? 0) > 2
                    }
                  />
                </div>
              ) : null}

              <div className="mt-6">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">What this means</h4>
                {competitorWhatThisMeansLoading ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">Writing a plain-language summary…</p>
                ) : competitorWhatThisMeans ? (
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
                    {stripWhatThisMeansHeader(competitorWhatThisMeans)}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-snug text-[var(--foreground)]">
                    {causalOneLine(brief.dominantActionable, brief.behind)}
                  </p>
                )}
              </div>

              <div className={`${DASH_SURFACE} mt-6 space-y-3 p-4`}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">DECISION</p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-[var(--foreground)]">
                    {brief.decisionText}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">WHY</p>
                  <p className="mt-1 text-sm leading-snug text-[var(--foreground)]">{brief.whyText}</p>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Business impact</h4>
                <p className="mt-2 text-sm leading-snug text-[var(--foreground)]">
                  {businessImpactLine(brief.behind, brief.riskNum)}{" "}
                  <span className="font-medium tabular-nums">
                    {brief.riskNum > 0
                      ? `Estimated revenue at risk: $${brief.riskNum.toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}/month (${brief.revenueImpact}).`
                      : `Estimated revenue at risk: $0/month (${brief.revenueImpact}).`}
                  </span>
                </p>
                {brief.riskNum > 0 ? (
                  <p className="mt-2 text-sm leading-snug text-[var(--muted)]">
                    $
                    {brief.riskNum.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    /month of this loss is due to slower performance vs competitors.
                    {typeof data.estimatedMonthlyLeak === "number" && Number.isFinite(data.estimatedMonthlyLeak) ? (
                      <>
                        {" "}
                        {brief.riskNum <= data.estimatedMonthlyLeak ? (
                          <span>
                            That amount fits inside your $
                            {data.estimatedMonthlyLeak.toLocaleString("en-US", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}{" "}
                            / month total estimated loss from the main analysis.
                          </span>
                        ) : (
                          <span>
                            Competitive modeling can exceed your $
                            {data.estimatedMonthlyLeak.toLocaleString("en-US", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}{" "}
                            baseline snapshot — treat it as additional competitive exposure, not a second stack of the
                            same loss.
                          </span>
                        )}
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className={`${DASH_SURFACE} mt-6 p-4`}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</h4>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-snug text-[var(--foreground)]">
                  {brief.actionPlan.length === 0 ? (
                    <li className="-ml-5 list-none text-[var(--muted)]">Re-run to load actions.</li>
                  ) : (
                    brief.actionPlan.map((item) => (
                      <li key={item.priority_rank}>{competitorMonetizationActionLine(item)}</li>
                    ))
                  )}
                </ol>
                {!proUser ? (
                  <div className="mt-5 rounded-lg border border-white/15 bg-white/[0.04] p-4">
                    <h5 className="text-sm font-semibold text-[var(--foreground)]">Fix these issues</h5>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                      See exactly what is causing these issues, where they occur, and how to fix them step-by-step.
                    </p>
                    <button
                      type="button"
                      onClick={() => setPriorityFixesUpgradeOpen(true)}
                      className="apm-btn-primary mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold shadow-lg shadow-black/20 transition-all hover:brightness-105 sm:w-auto"
                    >
                      Unlock Priority Fixes
                    </button>
                  </div>
                ) : brief.showPoorCtas ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link
                      href={priorityFixesHref}
                      className="apm-btn-primary w-full rounded-lg px-4 py-3 text-center text-sm font-semibold shadow-lg shadow-black/20 transition-all hover:brightness-105 sm:w-auto"
                    >
                      Fix performance issues
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setCompetitorModalOpen(true);
                        setCompetitorError(null);
                      }}
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-white/10 sm:w-auto"
                    >
                      Run comparison again after fixes
                    </button>
                  </div>
                ) : (
                  <Link
                    href={priorityFixesHref}
                    className="apm-btn-primary mt-4 block w-full rounded-lg px-4 py-3 text-center text-sm font-semibold shadow-lg shadow-black/20 transition-all hover:brightness-105"
                  >
                    {brief.priorityCtaLabel}
                  </Link>
                )}
              </div>
            </DashboardDisclosure>

            <button
              type="button"
              onClick={() => {
                setCompetitorModalOpen(true);
                setCompetitorError(null);
              }}
              className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-white/10"
            >
              Compare again
            </button>
          </>
        )}
      </section>

      {competitorModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${DASH_SURFACE} w-full max-w-md border-white/[0.12] p-6 shadow-2xl`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-[#dae2fd]">Compare with Competitors</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Enter up to 3 competitor URLs. This is a free, business-first comparison.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompetitorModalOpen(false);
                  setCompetitorLoading(false);
                  setCompetitorError(null);
                }}
                className="rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-white/10 hover:text-[var(--foreground)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <textarea
                inputMode="url"
                placeholder="Enter competitor URLs (e.g. comp1.com, comp2.com)"
                value={competitorUrlsText}
                onChange={(e) => {
                  setCompetitorUrlsText(e.target.value);
                  setCompetitorError(null);
                }}
                className="min-h-[92px] w-full resize-none rounded-lg border border-white/10 bg-[#060e20] px-3 py-2.5 text-[#dae2fd] placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]/50"
              />
              {competitorError && (
                <p className="mt-2 text-xs text-red-400" role="alert">
                  {competitorError}
                </p>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCompetitorModalOpen(false);
                  setCompetitorError(null);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-[#dae2fd]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={competitorLoading}
                onClick={runCompetitorAnalysis}
                className="apm-btn-primary rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
              >
                {competitorLoading ? "Analyzing..." : "Run free comparison"}
              </button>
            </div>
          </div>
        </div>
      )}

      <UpgradeModal
        open={priorityFixesUpgradeOpen}
        onOpenChange={setPriorityFixesUpgradeOpen}
        metricKey={null}
        projectId={projectId ?? null}
        onUpgraded={() => setDemoProUnlocked(true)}
      />
    </>
  );
}
