"use client";

type DashboardCollapsibleSectionProps = {
  id: string;
  title: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  sectionRef?: (el: HTMLElement | null) => void;
  /** Extra content always visible below the title row (e.g. primary CTA before expanding). */
  anchor?: React.ReactNode;
};

/**
 * Dashboard section with a disclosure header. Body stays mounted only when `open`
 * to keep long metric tables off the initial layout path.
 */
export function DashboardCollapsibleSection({
  id,
  title,
  description,
  open,
  onToggle,
  children,
  sectionRef,
  anchor,
}: DashboardCollapsibleSectionProps) {
  return (
    <section
      id={id}
      ref={sectionRef}
      className="scroll-mt-8 rounded-2xl border border-white/[0.08] bg-[#131b2e]/75 shadow-[0_0_0_1px_rgba(57,255,20,0.04),0_24px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl ring-1 ring-white/[0.03]"
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-tight text-[#dae2fd]">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm leading-snug text-slate-400">{description}</p>
            ) : null}
            {anchor ? <div className="mt-4">{anchor}</div> : null}
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="shrink-0 self-start rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#dae2fd] transition hover:border-[#39FF14]/35 hover:bg-[#39FF14]/10"
          >
            {open ? "Hide details" : "Show details"}
          </button>
        </div>
        {open ? <div className="mt-5 border-t border-white/[0.08] pt-5">{children}</div> : null}
      </div>
    </section>
  );
}

type DashboardDisclosureProps = {
  open: boolean;
  onToggle: () => void;
  summary: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/** Inline disclosure (no outer &lt;section&gt;) for use inside an existing section. */
export function DashboardDisclosure({ open, onToggle, summary, children, className = "" }: DashboardDisclosureProps) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.06]"
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
