"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";

export default function PerformanceHistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAuthenticated = status === "authenticated" && !!session?.user;

  useEffect(() => {
    if (status === "loading") return;
    if (isAuthenticated) {
      router.replace("/dashboard");
      return;
    }
  }, [status, isAuthenticated, router]);

  if (status === "loading" || isAuthenticated) {
    return (
      <AppShell contentClassName="flex min-h-screen items-center justify-center">
        <span className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
          <span className="inline-block w-4 h-4 border-2 border-[var(--muted)]/30 border-t-[var(--muted)] rounded-full animate-spin" />
          Loading…
        </span>
      </AppShell>
    );
  }

  return (
    <AppShell contentClassName="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="ui-panel relative w-full max-w-md p-8 shadow-2xl">
        <h1 className="text-xl font-semibold text-zinc-100">
          Performance History
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
          Track performance changes, detect regressions, and monitor trends over time.
        </p>
        <button
          type="button"
          onClick={() => router.push("/login?redirect=/performance-history")}
          className="mt-6 w-full rounded-lg apm-btn-primary px-4 py-3 text-sm font-medium  hover:opacity-90"
        >
          Check Performance History
        </button>
      </div>
    </AppShell>
  );
}
