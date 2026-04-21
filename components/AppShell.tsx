/**
 * Full-viewport APM shell: charcoal gradient + lime grid (::before on .home-apm-bg).
 * Use for auth, marketing, and standalone report-style pages — not the dashboard layout.
 */
export function AppShell({
  children,
  className = "",
  contentClassName = "",
}: {
  children: React.ReactNode;
  className?: string;
  /** Applied to the inner stacking wrapper (e.g. flex centering, padding). */
  contentClassName?: string;
}) {
  return (
    <div
      className={`home-premium home-apm home-apm-bg min-h-screen text-zinc-100 ${className}`}
    >
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </div>
  );
}
