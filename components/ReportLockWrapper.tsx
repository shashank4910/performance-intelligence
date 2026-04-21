"use client";

import Link from "next/link";

export function ReportLockWrapper({
  isLocked,
  children,
}: {
  isLocked: boolean;
  children: React.ReactNode;
}) {
  if (!isLocked) return <>{children}</>;

  return (
    <div className="relative">
      <div
        className="transition-all duration-300"
        style={{
          filter: "blur(8px)",
          pointerEvents: "none",
          userSelect: "none",
        }}
        aria-hidden={true}
      >
        {children}
      </div>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
        style={{ pointerEvents: "auto" }}
        aria-modal="true"
        role="dialog"
      >
        <div
          className="ui-panel mx-4 w-full max-w-md p-8 text-center shadow-2xl backdrop-blur-md transition-opacity duration-300"
          style={{
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
          }}
        >
          <h2 className="text-xl font-semibold text-white">
            Create an account to unlock your full Performance Intelligence Report
          </h2>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Your analysis is ready. Sign up or log in to view metrics, revenue impact, and recommendations.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/auth/signup?redirect=/dashboard"
              className="rounded-lg apm-btn-primary px-5 py-2.5 text-sm font-medium  hover:opacity-90 transition"
            >
              Sign Up
            </Link>
            <Link
              href="/auth/login?redirect=/dashboard"
              className="rounded-lg border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-white/10 transition"
            >
              Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
