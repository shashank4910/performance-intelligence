"use client";

/**
 * Demo upgrade modal: simulated payment. On "Complete Demo Upgrade":
 * - Calls onUpgraded() so parent sets demo Pro state (session-only, not persisted)
 * - Closes modal
 * - Opens /financial-report?metric=<metricKey>&demo=1 in a new tab (demo=1 grants session access on that page)
 */

type UpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current metric key for the financial report query (e.g. core-lcp). */
  metricKey: string | null;
  /** Optional projectId so the report page can load project from sessionStorage. */
  projectId?: string | null;
  /** Called after demo upgrade so parent can refresh isPro (e.g. setState). */
  onUpgraded?: () => void;
};

export default function UpgradeModal({
  open,
  onOpenChange,
  metricKey,
  projectId,
  onUpgraded,
}: UpgradeModalProps) {
  if (!open) return null;

  const handleCompleteDemo = () => {
    onUpgraded?.();
    onOpenChange(false);
    const params = new URLSearchParams();
    params.set("demo", "1");
    if (metricKey) params.set("metric", metricKey);
    if (projectId) params.set("projectId", projectId);
    const qs = params.toString();
    const url = `/financial-report?${qs}`;
    window.open(url, "_blank");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-demo-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-md ui-panel p-6 shadow-xl">
        <h2 id="upgrade-demo-title" className="text-lg font-semibold text-[var(--foreground)]">
          Upgrade to Pro (Demo)
        </h2>
        <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
          This is a simulated payment for testing.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCompleteDemo}
            className="rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90"
          >
            Complete Demo Upgrade
          </button>
        </div>
      </div>
    </div>
  );
}
