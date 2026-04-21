"use client";

/**
 * Pro upgrade modal (Dialog-style). Shown when a guest user clicks a blurred "Unlock with Pro" badge.
 * Uses the same overlay/panel pattern as Shadcn Dialog for consistency.
 */
type ProUpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const CHECKOUT_PLACEHOLDER_URL = "/dashboard"; // Replace with planned checkout URL when ready

export default function ProUpgradeModal({ open, onOpenChange }: ProUpgradeModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-upgrade-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-md ui-panel p-6 shadow-xl">
        <h2 id="pro-upgrade-title" className="text-lg font-semibold text-[var(--foreground)]">
          Unlock Financial Intelligence
        </h2>
        <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
          Stop guessing which files cost you money. Get weekly leak alerts and board-ready ROI reports.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-white/10"
          >
            Maybe later
          </button>
          <a
            href={CHECKOUT_PLACEHOLDER_URL}
            className="rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90"
          >
            Start 14-Day Pro Trial
          </a>
        </div>
      </div>
    </div>
  );
}
