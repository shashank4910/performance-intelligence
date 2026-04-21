"use client";

import Link from "next/link";

export type LockedPreviewOpportunity = {
  actionTitle: string;
  filename: string;
  metricAffected: string;
};

type LockedRevenueRecoveryProps = {
  /** First 2 fixes to show as blurred preview. */
  previewOpportunities?: LockedPreviewOpportunity[];
  /** Optional CTA link (e.g. upgrade or dashboard). */
  onUpgradeClick?: () => void;
  /** Show inline or as standalone section (e.g. financial-report page). */
  standalone?: boolean;
};

export default function LockedRevenueRecovery({
  previewOpportunities = [],
  onUpgradeClick,
  standalone = false,
}: LockedRevenueRecoveryProps) {
  const preview = previewOpportunities.slice(0, 2);
  const wrapperClass = standalone
    ? "min-h-screen bg-[var(--background)] text-[var(--foreground)] p-8 max-w-4xl mx-auto"
    : "";

  return (
    <div className={wrapperClass}>
      <section className="scroll-mt-8">
        <h2 className="text-lg font-semibold text-white">Revenue Recovery Opportunities</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Preview of top fixes (blurred)</p>

        {preview.length > 0 && (
          <div className="mt-4 space-y-4 relative">
            <div className="blur-md select-none pointer-events-none">
              {preview.map((opp, idx) => (
                <div
                  key={`${opp.actionTitle}-${idx}`}
                  className="ui-panel p-5"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Fix #{idx + 1}
                  </span>
                  <h3 className="mt-1 font-semibold text-[var(--foreground)]">{opp.actionTitle}</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">{opp.filename}</p>
                  <p className="text-xs text-[var(--muted)] mt-1">{opp.metricAffected}</p>
                  <div className="mt-4 h-10 rounded-lg bg-white/10 w-24" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-[#befe34]/30 bg-[#befe34]/10 p-6 text-center">
          <h3 className="text-base font-semibold text-[var(--foreground)]">
            Unlock Performance Intelligence
          </h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            See exactly which fixes recover revenue.
          </p>
          {onUpgradeClick ? (
            <button
              type="button"
              onClick={onUpgradeClick}
              className="mt-4 rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90"
            >
              Upgrade to Pro
            </button>
          ) : (
            <Link
              href="/dashboard"
              className="mt-4 inline-block rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90"
            >
              Unlock Performance Intelligence
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
