"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AnalyzePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <div className="home-premium home-apm home-apm-bg relative flex min-h-screen items-center justify-center">
      <span className="relative z-10 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
        <span className="inline-block w-4 h-4 border-2 border-[var(--muted)]/30 border-t-[var(--muted)] rounded-full animate-spin" />
        Redirecting to Analyze…
      </span>
    </div>
  );
}
