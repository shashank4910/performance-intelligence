"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type RevenueImpactProfile = {
  id: string;
  projectId: string;
  businessModelId: string;
  monthlyRevenue: number;
  advancedInputs?: Record<string, unknown> | null;
  sensitivityMode: string;
  lastCalculatedOpportunity?: { low: number; expected: number; high: number } | null;
  lastConfidence?: string | null;
  modelVersion?: string | null;
  lastRunAt?: string | null;
  lastSnapshotTimestamp?: string | null;
  updatedAt: string;
};

type RevenueImpactCardProps = {
  /** Project id for loading/saving business profile and linking to workspace. When absent, card shows configure CTA but link may be disabled or point to dashboard. */
  projectId?: string | null;
};

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function formatModelId(id: string | undefined | null): string {
  if (id == null || typeof id !== "string") return "—";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export default function RevenueImpactCard({ projectId }: RevenueImpactCardProps) {
  const [profile, setProfile] = useState<RevenueImpactProfile | null | "loading">("loading");
  const [currentSnapshotIso, setCurrentSnapshotIso] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      /* Reset when leaving a project context (e.g. report page without id). */
      /* eslint-disable react-hooks/set-state-in-effect -- synchronous reset before async branches */
      setProfile(null);
      setCurrentSnapshotIso(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/project-business-profile?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) {
          if (!cancelled) setProfile(null);
          return;
        }
        const data = (await res.json()) as { profile: RevenueImpactProfile | null };
        if (!cancelled) setProfile(data.profile ?? null);
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setCurrentSnapshotIso(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { lastSnapshot?: { timestamp?: string } | null };
        const ts = body.lastSnapshot?.timestamp;
        if (!cancelled && typeof ts === "string") setCurrentSnapshotIso(ts);
        else if (!cancelled) setCurrentSnapshotIso(null);
      } catch {
        if (!cancelled) setCurrentSnapshotIso(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const workspaceHref = projectId ? `/dashboard/${projectId}/revenue-impact` : "/dashboard";
  const openInNewTab = projectId ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};

  if (profile === "loading" && projectId) {
    return (
      <div className="mt-4 ui-panel p-6">
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      </div>
    );
  }

  if (!profile || profile === "loading") {
    return (
      <div className="mt-4 space-y-4 ui-panel p-6">
        <h3 className="text-base font-semibold text-[var(--foreground)]">Revenue Impact Simulation</h3>
        <p className="text-sm text-[var(--muted)]">
          Translate performance into projected revenue opportunity.
        </p>
        <Link
          href={workspaceHref}
          className="inline-flex items-center gap-2 rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90"
          {...openInNewTab}
        >
          Configure & Run Simulation →
        </Link>
      </div>
    );
  }

  const opp = profile.lastCalculatedOpportunity;
  const normalizeTs = (s: string | null | undefined) =>
    typeof s === "string" ? s.trim().replace(/\.\d{3}Z$/, "Z") : "";
  const opportunityStale =
    !!opp &&
    !!profile.lastSnapshotTimestamp &&
    !!currentSnapshotIso &&
    normalizeTs(profile.lastSnapshotTimestamp) !== normalizeTs(currentSnapshotIso);
  const confidenceClass =
    profile.lastConfidence === "high"
      ? "bg-emerald-500/20 text-emerald-400"
      : profile.lastConfidence === "moderate"
        ? "bg-amber-500/20 text-amber-400"
        : "bg-white/10 text-[var(--muted)]";

  return (
    <div className="mt-4 space-y-4 ui-panel p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Business Model</div>
          <div className="text-sm font-medium text-[var(--foreground)]">
            {formatModelId(profile.businessModelId)}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Monthly Revenue</div>
          <div className="text-sm font-medium text-[var(--foreground)] tabular-nums">
            {formatCurrency(profile.monthlyRevenue)}
          </div>
        </div>
      </div>
      {opportunityStale && (
        <p className="text-xs text-amber-400/95 border border-amber-500/25 rounded-lg px-3 py-2 bg-amber-500/10">
          These numbers are from a previous lab snapshot. Open the workspace and run the simulation again to align with your latest analyze.
        </p>
      )}
      {opp && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Opportunity (Low)</div>
            <div className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {formatCurrency(opp.low)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Opportunity (Expected)</div>
            <div className="text-lg font-semibold tabular-nums text-[var(--accent)]">
              {formatCurrency(opp.expected)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Opportunity (High)</div>
            <div className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {formatCurrency(opp.high)}
            </div>
          </div>
        </div>
      )}
      {profile.lastConfidence && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--muted)]">Confidence:</span>
          <span className={`text-xs px-2 py-1 rounded ${confidenceClass}`}>
            {profile.lastConfidence}
          </span>
        </div>
      )}
      <Link
        href={workspaceHref}
        className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-white/10"
        {...openInNewTab}
      >
        Open Simulation Workspace →
      </Link>
    </div>
  );
}
