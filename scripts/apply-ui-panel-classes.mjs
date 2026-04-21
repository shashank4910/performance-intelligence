import fs from "fs";
import path from "path";

const roots = ["app", "components"];

const replacements = [
  [
    "rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden transition-all duration-300",
    "ui-panel overflow-hidden transition-all duration-300",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.03] p-6 border-t-2 border-t-[var(--accent)]/25",
    "ui-panel p-6 border-t-2 border-t-[var(--accent)]/25",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.03] p-6",
    "ui-panel p-6",
  ],
  [
    "rounded-xl border border-white/[0.06] bg-white/[0.03] p-5",
    "ui-panel p-5",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.03] p-5",
    "ui-panel p-5",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.03] p-4",
    "ui-panel p-4",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3",
    "ui-panel p-4 space-y-3",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden",
    "ui-panel overflow-hidden",
  ],
  [
    "rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden",
    "ui-panel overflow-hidden",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden",
    "ui-panel ui-panel--muted overflow-hidden",
  ],
  [
    "rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden",
    "ui-panel ui-panel--muted overflow-hidden",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.02] p-5",
    "ui-panel ui-panel--muted p-5",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.02] p-4",
    "ui-panel ui-panel--muted p-4",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3",
    "ui-panel ui-panel--muted px-4 py-3",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3",
    "ui-panel ui-panel--muted px-4 py-3",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-4",
    "ui-panel ui-panel--muted p-6 space-y-4",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-3",
    "ui-panel ui-panel--muted p-6 space-y-3",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-4",
    "ui-panel p-6 space-y-4",
  ],
  [
    "rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-3",
    "ui-panel p-6 space-y-3",
  ],
  [
    "group w-full text-left rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#befe34]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
    "group w-full text-left ui-panel ui-panel--muted p-4 transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#befe34]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
  ],
  [
    "rounded-lg border border-white/10 bg-white/[0.03] p-4",
    "ui-panel ui-panel--muted rounded-lg p-4",
  ],
  [
    "rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 flex flex-wrap items-start justify-between gap-3",
    "ui-panel ui-panel--muted rounded-lg p-4 flex flex-wrap items-start justify-between gap-3",
  ],
  [
    "rounded-lg border border-white/[0.08] bg-white/[0.03] overflow-hidden",
    "ui-panel ui-panel--muted rounded-lg overflow-hidden",
  ],
  [
    "scroll-mt-8 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden",
    "scroll-mt-8 ui-panel ui-panel--muted overflow-hidden",
  ],
  [
    "scroll-mt-8 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden",
    "scroll-mt-8 ui-panel ui-panel--muted overflow-hidden",
  ],
  [
    "mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-6",
    "mt-6 ui-panel p-6",
  ],
  [
    "mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4",
    "mt-6 ui-panel p-4",
  ],
  [
    "mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3",
    "mt-6 ui-panel p-4 space-y-3",
  ],
  [
    "rounded-xl border border-white/10 bg-[var(--card)] p-6 shadow-xl",
    "ui-panel p-6 shadow-xl",
  ],
  [
    "relative w-full max-w-md overflow-visible rounded-xl border border-white/10 bg-[var(--card)] p-6 shadow-xl",
    "relative w-full max-w-md overflow-visible ui-panel p-6 shadow-xl",
  ],
  [
    "w-full max-w-md rounded-xl border border-white/10 bg-[rgba(15,23,42,0.95)] p-6 shadow-2xl",
    "ui-panel w-full max-w-md p-6 shadow-2xl",
  ],
];

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory() && f !== "node_modules" && f !== ".next") walk(p);
    else if (f.endsWith(".tsx")) {
      let c = fs.readFileSync(p, "utf8");
      const orig = c;
      for (const [a, b] of replacements) {
        if (c.includes(a)) c = c.split(a).join(b);
      }
      if (c !== orig) fs.writeFileSync(p, c);
    }
  }
}

for (const r of roots) {
  if (fs.existsSync(r)) walk(r);
}
console.log("done");
