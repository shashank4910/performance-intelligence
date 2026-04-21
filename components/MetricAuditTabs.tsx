"use client";

export type AuditTabId = "technical" | "financial";

type MetricAuditTabsProps = {
  activeTab: AuditTabId;
  onTabChange: (tab: AuditTabId) => void;
};

/** Reusable tab bar for metric drawers: Technical Breakdown (default) | ♦ Financial Forensic Audit. */
export default function MetricAuditTabs({ activeTab, onTabChange }: MetricAuditTabsProps) {
  return (
    <div className="flex border-b border-white/10 mb-4">
      <button
        type="button"
        onClick={() => onTabChange("technical")}
        className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
          activeTab === "technical"
            ? "border-[var(--accent)] text-[var(--foreground)]"
            : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        Technical Breakdown
      </button>
      <button
        type="button"
        onClick={() => onTabChange("financial")}
        className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1 ${
          activeTab === "financial"
            ? "border-[var(--accent)] text-[var(--foreground)]"
            : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        <span className="text-[10px] text-amber-400/90" aria-hidden>♦</span>
        Financial Forensic Audit
      </button>
    </div>
  );
}
