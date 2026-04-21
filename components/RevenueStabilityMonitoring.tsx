"use client";

import { useEffect, useState } from "react";

type WhatChangedBullet = { symbol: "+" | "−" | "="; text: string };

type Payload = {
  currentStatus: string;
  whatChanged: WhatChangedBullet[];
  previousRevenueLine: string;
  currentRevenueLine: string;
  alertMessage: string | null;
  minimalHistory: { dateLabel: string; label: "Improved" | "Stable" | "Worsened" }[];
};

type ApiOk = {
  state: "ready";
  tier: "free" | "pro";
  payload: Payload;
};

type ApiOther = {
  state: "needs_second_run" | "legacy_snapshots";
  tier: "free" | "pro";
  payload: null;
  message?: string;
};

export function RevenueStabilityMonitoring({
  projectId,
  isProUser,
}: {
  projectId: string;
  isProUser: boolean;
}) {
  const [data, setData] = useState<ApiOk | ApiOther | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const extended = isProUser ? "1" : "0";
    fetch(`/api/projects/${encodeURIComponent(projectId)}/revenue-stability?extended=${extended}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
        }
        return res.json() as Promise<ApiOk | ApiOther>;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, isProUser]);

  if (error) {
    return (
      <p className="text-sm text-[var(--muted)]" role="alert">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-[var(--muted)]" aria-live="polite">
        Loading revenue stability…
      </p>
    );
  }

  if (data.state !== "ready" || !data.payload) {
    return (
      <div className="space-y-2 text-sm leading-relaxed text-slate-400">
        <p>{data.message ?? "Monitoring unavailable."}</p>
        {!isProUser && data.state === "needs_second_run" ? (
          <p className="text-xs text-[var(--muted)]">
            Pro unlocks up to 30 days of change history and breakdown.
          </p>
        ) : null}
      </div>
    );
  }

  const p = data.payload;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Current status
        </h4>
        <p className="mt-1 text-sm leading-relaxed text-[#dae2fd]">{p.currentStatus}</p>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          What changed
        </h4>
        <ul className="mt-2 list-none space-y-1.5 text-sm text-slate-300">
          {p.whatChanged.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-4 shrink-0 text-slate-500">{b.symbol}</span>
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Revenue trend
        </h4>
        <div className="mt-2 space-y-1 text-sm tabular-nums text-[#dae2fd]">
          <p>
            Previous: {p.previousRevenueLine}
          </p>
          <p>
            Current: {p.currentRevenueLine}
          </p>
        </div>
      </div>

      {p.alertMessage ? (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/95"
          role="status"
        >
          {p.alertMessage}
        </div>
      ) : null}

      {isProUser && p.minimalHistory.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent direction
          </h4>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {p.minimalHistory.map((h, i) => (
              <li key={i}>
                {h.dateLabel} — {h.label}
              </li>
            ))}
          </ul>
        </div>
      ) : !isProUser ? (
        <p className="text-xs text-[var(--muted)]">
          Upgrade to Pro for up to 30 days of direction history and change breakdown.
        </p>
      ) : null}
    </div>
  );
}
