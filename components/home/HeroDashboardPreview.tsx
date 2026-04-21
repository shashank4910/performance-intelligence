"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

const SLIDE_COUNT = 4;
const AUTO_MS = 6500;

const THINK_WITH_GOOGLE_ABANDONMENT =
  "https://www.thinkwithgoogle.com/marketing-strategies/app-and-mobile/mobile-site-abandonment-three-second-load/";

const WEB_DEV_MILLISECONDS = "https://web.dev/case-studies/milliseconds-make-millions/";

const WEB_DEV_WHY_SPEED = "https://web.dev/learn/performance/why-speed-matters";

const FACTORS_SLIDE1 = [
  { label: "Speed", status: "At risk", tone: "risk" as const },
  { label: "User experience", status: "Needs attention", tone: "warn" as const },
  { label: "Scalability", status: "OK", tone: "ok" as const },
];

function FactorDot({ tone }: { tone: "risk" | "warn" | "ok" }) {
  const cls =
    tone === "risk" ? "bg-red-500" : tone === "warn" ? "bg-amber-400" : "bg-emerald-500";
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden />;
}

function ResearchCard({
  accent,
  tag,
  sourceLabel,
  children,
  footnote,
  sourceHref,
  sourceLinkText,
}: {
  accent: "blue" | "emerald" | "amber";
  tag: string;
  sourceLabel: string;
  children: ReactNode;
  footnote: string;
  sourceHref: string;
  sourceLinkText: string;
}) {
  const bar =
    accent === "blue"
      ? "bg-blue-500/75"
      : accent === "emerald"
        ? "bg-emerald-500/70"
        : "bg-amber-500/75";
  return (
    <figure className="relative mt-4 flex-1 overflow-hidden rounded-lg border border-zinc-800/90 bg-zinc-900/60 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.035)]">
      <div className={`absolute left-0 top-0 h-full w-[3px] ${bar}`} aria-hidden />
      <div className="pl-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-zinc-700/90 bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {tag}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">{sourceLabel}</span>
        </div>
        <div className="mt-3.5">{children}</div>
        <figcaption className="mt-4 border-t border-zinc-800/70 pt-3 text-[11px] leading-relaxed text-zinc-500">
          {footnote}{" "}
          <a
            href={sourceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-400/95 underline decoration-blue-500/30 underline-offset-2 transition hover:text-blue-300"
          >
            {sourceLinkText}
          </a>
        </figcaption>
      </div>
    </figure>
  );
}

function Slide1PerformanceSignal() {
  return (
    <>
      <div className="pb-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Performance health</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums tracking-tight text-zinc-50 sm:text-[2.5rem]">7.2</span>
              <span className="text-lg font-medium text-zinc-500 sm:text-xl">/ 10</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">Overall site health</p>
          </div>
          <span className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-300">
            Needs work
          </span>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-zinc-400">This may be slowing down conversions.</p>
      </div>
      <div className="mt-6 border-t border-zinc-800/80 pt-5">
        <ul className="space-y-3">
          {FACTORS_SLIDE1.map((row) => (
            <li key={row.label} className="flex items-start gap-3">
              <FactorDot tone={row.tone} />
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-sm">
                <span className="font-medium text-zinc-200">{row.label}</span>
                <span
                  className={
                    row.tone === "risk"
                      ? "text-xs font-medium text-red-400"
                      : row.tone === "warn"
                        ? "text-xs font-medium text-amber-400"
                        : "text-xs font-medium text-emerald-400"
                  }
                >
                  {row.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Slide2GoogleResearch() {
  return (
    <div className="flex min-h-[260px] flex-col">
      <ResearchCard
        accent="blue"
        tag="Fact"
        sourceLabel="Think with Google"
        footnote="Industry benchmark, not your traffic."
        sourceHref={THINK_WITH_GOOGLE_ABANDONMENT}
        sourceLinkText="Read source →"
      >
        <p className="text-sm font-semibold leading-snug text-zinc-100 sm:text-[15px]">
          <span className="text-red-400">53%</span> of mobile visits bail when a page keeps people waiting past ~3
          seconds.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          Slow loads eat intent before signup or checkout—same ad spend, fewer outcomes.
        </p>
      </ResearchCard>
    </div>
  );
}

function Slide3MillisecondsResearch() {
  return (
    <div className="flex min-h-[260px] flex-col">
      <ResearchCard
        accent="emerald"
        tag="Fact"
        sourceLabel="Google · Deloitte"
        footnote="Summarized on Google web.dev write-up."
        sourceHref={WEB_DEV_MILLISECONDS}
        sourceLinkText="Read study →"
      >
        <p className="text-sm font-semibold leading-snug text-zinc-100 sm:text-[15px]">
          Across <span className="text-emerald-400/95">37</span> major brands, shaving{" "}
          <span className="text-emerald-400/95">0.1s</span> off key mobile timings linked to{" "}
          <span className="text-emerald-400/95">9.2% more</span> retail spend on average.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">Small speed wins stack—especially on phones.</p>
      </ResearchCard>
    </div>
  );
}

function Slide4SecondsResearch() {
  return (
    <div className="flex min-h-[260px] flex-col">
      <ResearchCard
        accent="amber"
        tag="Fact"
        sourceLabel="BBC · via web.dev"
        footnote="Classic cautionary datapoint in Google’s perf course."
        sourceHref={WEB_DEV_WHY_SPEED}
        sourceLinkText="Why speed matters →"
      >
        <p className="text-sm font-semibold leading-snug text-zinc-100 sm:text-[15px]">
          The BBC saw roughly <span className="text-amber-400/95">10%</span> more users slip away for{" "}
          <span className="text-amber-400/95">each extra second</span> of load.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">Seconds add up—often before you notice in analytics.</p>
      </ResearchCard>
    </div>
  );
}

const SLIDE_LABELS = [
  "Performance signal",
  "Google research",
  "Milliseconds study",
  "Seconds & users",
];

/** Homepage hero: 4-slide carousel with auto-advance (pauses only for reduced motion). */
export function HeroDashboardPreview() {
  const [slide, setSlide] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % SLIDE_COUNT);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  const go = useCallback((i: number) => {
    setSlide(((i % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT);
  }, []);

  const transitionClass = reduceMotion ? "" : "transition-opacity duration-500 ease-out";

  return (
    <section
      className="mx-auto w-full max-w-[440px] overflow-hidden rounded-xl border border-zinc-800/80 bg-[#0B0F17] text-zinc-100 shadow-[0_10px_36px_-10px_rgba(0,0,0,0.58)] lg:max-w-none"
      aria-roledescription="carousel"
      aria-label="Performance and business story"
    >
      <div className="sr-only" aria-live="polite">
        Slide {slide + 1} of {SLIDE_COUNT}: {SLIDE_LABELS[slide]}
      </div>

      <div className="relative min-h-[320px] sm:min-h-[340px]">
        {[Slide1PerformanceSignal, Slide2GoogleResearch, Slide3MillisecondsResearch, Slide4SecondsResearch].map(
          (Slide, i) => (
            <div
              key={i}
              className={`absolute inset-0 px-6 pb-4 pt-6 ${transitionClass} ${
                i === slide ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"
              }`}
              inert={i !== slide}
            >
              <Slide />
            </div>
          )
        )}
      </div>

      <div className="flex items-center justify-center gap-2.5 border-t border-zinc-800/80 bg-zinc-950/30 px-4 py-3.5">
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            className={`h-2 rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#befe34]/40 ${
              i === slide ? "w-7 bg-zinc-200" : "w-2 bg-zinc-600 hover:bg-zinc-500"
            }`}
            aria-label={`Show slide ${i + 1}: ${SLIDE_LABELS[i]}`}
            aria-current={i === slide}
          />
        ))}
      </div>
    </section>
  );
}
