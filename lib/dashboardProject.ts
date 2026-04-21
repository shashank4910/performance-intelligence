// Shared types + loader for the project dashboard + its analysis sub-pages.
//
// The same StoredProject shape is produced by /api/analyze and persisted in
// sessionStorage (per tab) + localStorage (cross-tab). Every page under
// /dashboard/[projectId]/** reads from the same cache so numbers stay
// consistent across the decision surface (dashboard) and the drilldown
// analysis pages (technical / history / competition / roadmap).

import { useEffect, useState } from "react";
import { getProjectReportJson, setProjectReportJson } from "@/lib/projectClientStorage";
import type { CompetitorAnalysisOutput } from "@/engine/competitorAnalysis";

export type RiskBreakdown = {
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

export type FixPriority = {
  category: string;
  score: number;
  priority: "High" | "Medium" | "Low";
};

export type StoredProject = {
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
    estimatedMonthlyLeak?: number;
    leak_by_metric?: Record<string, number>;
    cortex_diagnostic?: Record<string, unknown>;
    baselineRevenueForCompetitorAnalysis?: number;
    deviceImpact?: {
      mobile?: { health?: number; revenueRiskScore?: number };
      desktop?: { health?: number; revenueRiskScore?: number };
    };
    revenueImpactInputs?: {
      lcpSeconds?: number;
      inpMs?: number | null;
    };
    detailed_metrics?: Record<string, unknown>;
    metrics_for_dashboard?: Array<{
      metricKey: string;
      label: string;
      displayValue: string;
      verdict: string;
      resources?: {
        url: string | null;
        totalBytes: number;
        wastedBytes: number;
        element: string | null;
      }[];
    }>;
    rawAudit?: Record<string, unknown>;
    competitive_analysis?: CompetitorAnalysisOutput | null;
    userPlan?: string;
  };
  analyzedAt?: string;
};

export type StoredProjectState = StoredProject | null | "loading";

/**
 * Client hook that mirrors the dashboard's load path so every analysis
 * sub-page uses the exact same StoredProject object. Returns "loading"
 * while params hydrate, null if the report is missing/invalid.
 */
export function useStoredProject(
  projectId: string | undefined,
  runKey?: string | null
): [StoredProjectState, (updater: (prev: StoredProject) => StoredProject) => void] {
  const [stored, setStored] = useState<StoredProjectState>("loading");

  useEffect(() => {
    if (!projectId) {
      setStored("loading");
      return;
    }
    try {
      const raw = getProjectReportJson(projectId);
      if (!raw) {
        setStored(null);
        return;
      }
      const parsed = JSON.parse(raw) as StoredProject;
      setStored(parsed);
    } catch {
      setStored(null);
    }
  }, [projectId, runKey]);

  const update = (updater: (prev: StoredProject) => StoredProject) => {
    setStored((prev) => {
      if (!prev || prev === "loading") return prev;
      const next = updater(prev);
      if (projectId && typeof window !== "undefined") {
        try {
          setProjectReportJson(projectId, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return [stored, update];
}

/** Common derivation used by multiple pages to decide Pro gating. */
export function isProUser(stored: StoredProject, demoUnlocked: boolean): boolean {
  const plan = stored.data.userPlan;
  return (typeof plan === "string" && plan === "pro") || demoUnlocked;
}

/** Overall health score 0–100, normalized across the three sources analyze produces. */
export function overallHealth100(stored: StoredProject): number {
  const data = stored.data;
  if (typeof data.overallHealth === "number") return data.overallHealth;
  const summary = data.summary;
  if (typeof summary?.overall_health_score === "number") return summary.overall_health_score;
  return Number(summary?.overall_health_display) || 0;
}
