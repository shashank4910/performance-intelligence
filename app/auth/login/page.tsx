"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setProjectReportJson } from "@/lib/projectClientStorage";
import { AppShell } from "@/components/AppShell";

const PENDING_KEY = "pendingAnalysisResult";

function AuthLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const successRedirect = redirectParam ?? callbackUrl;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      router.refresh();
      await new Promise((r) => setTimeout(r, 150));

      const pendingJson =
        typeof window !== "undefined" ? localStorage.getItem(PENDING_KEY) : null;
      if (pendingJson) {
        try {
          const pending = JSON.parse(pendingJson) as {
            url?: string;
            data?: Record<string, unknown>;
          };
          if (pending?.url && pending?.data) {
            const saveRes = await fetch("/api/save-pending-result", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: pending.url, data: pending.data }),
            });
            if (saveRes.ok) {
              const { projectId } = (await saveRes.json()) as {
                projectId?: string;
              };
              if (projectId && typeof window !== "undefined") {
                setProjectReportJson(
                  projectId,
                  JSON.stringify({ url: pending.url, data: pending.data })
                );
                localStorage.removeItem(PENDING_KEY);
                router.push(`/dashboard/${projectId}`);
                router.refresh();
                return;
              }
              localStorage.removeItem(PENDING_KEY);
            }
          }
        } catch {
          // ignore parse/network errors; fall back to normal redirect
        }
      }

      router.push(successRedirect);
      router.refresh();
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <AppShell contentClassName="flex min-h-screen items-center justify-center px-4">
      <div className="ui-panel relative w-full max-w-sm p-8 shadow-2xl">
        <h1 className="text-xl font-semibold text-zinc-100">Log in</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Access your dashboard and full report
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-[var(--muted)] focus:border-white/20 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="apm-btn-primary w-full rounded-xl py-2.5 text-sm disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          No account?{" "}
          <Link
            href={
              redirectParam
                ? `/auth/signup?redirect=${encodeURIComponent(redirectParam)}`
                : "/auth/signup"
            }
            className="text-[var(--accent)] hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

export default function AuthLoginPage() {
  return (
    <Suspense
      fallback={
        <AppShell contentClassName="flex min-h-screen items-center justify-center px-4">
          <div className="ui-panel relative w-full max-w-sm p-8 shadow-2xl" />
        </AppShell>
      }
    >
      <AuthLoginInner />
    </Suspense>
  );
}
