# Paywall UI — Revenue Recovery Opportunities

## Goal

Free users see enough value (first 2 fixes, full content) and a clear “more behind paywall” strip (fixes 3+ with visible headers + blurred details) and a single, prominent CTA. No full-page lock; section-level blur only.

## Structure

1. **Accordion header** (always visible)
   - Title: "Revenue Recovery Opportunities"
   - Subtitle: "Top issues ranked by recoverable revenue. Fix these first for the highest impact."
   - Affordance: Chevron or "Click to expand" / "Click to collapse"
   - Collapsed by default

2. **When expanded**
   - **Visible fixes** (Pro: all; Free: first 2)
     - Full card: Fix #, action title, filename, metric, Improves badges, revenue badge, Why / Recommended fix / Estimated improvement
     - Same card style as today: `rounded-xl border border-white/10 bg-white/[0.03] p-5`

3. **Locked strip** (Free only, when opportunities.length > 2)
   - Optional small label above: "More fixes (Pro)" or "Unlock remaining fixes"
   - For each locked item: one card per fix
     - **Sharp:** Fix #, action title, filename, metric, revenue badge (same layout as visible cards, no blur)
     - **Blurred:** Single block below with `blur-[6px]`: "Why this matters", "Recommended fix", "Estimated improvement"
   - Soft blur so user recognizes more content exists; no heavy overlay

4. **CTA block** (Free only, when there are locked items)
   - Placed directly under the locked strip (no gap or a small gap)
   - Container: `rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-6 text-center`
   - Optional: very subtle glow (e.g. `shadow-[0_0_40px_var(--glow)]`) to draw attention
   - Heading: "Unlock Performance Intelligence" (`text-base font-semibold text-[var(--foreground)]`)
   - One line: "See exactly which fixes recover revenue." (`text-sm text-[var(--muted)]`)
   - Button: "Upgrade to Pro" — primary button style, `onClick={onDemoUpgrade}`

## Visual hierarchy

- Accordion header: clear, tappable (cursor-pointer), focus ring for a11y
- Visible cards: unchanged from current design
- Locked cards: same card chrome; only the description area is in a blurred wrapper so Fix # / Title / Revenue stay readable
- CTA: one clear block; avoid multiple competing buttons

## Do not

- Blur the entire section
- Hide Fix #, title, or revenue badge on locked items
- Add more than one CTA in this section
- Change revenue or priority logic (UI only)

## Design tokens (from design-system.md)

- Card: `border-white/10`, `bg-white/[0.03]`, `rounded-xl`, `p-5`
- CTA container: `border-[var(--accent)]/30`, `bg-[var(--accent)]/10`
- Button: `bg-[var(--accent)]`, `text-white`, `rounded-lg`, `hover:opacity-90`
- Blur: `blur-[6px]`, `select-none`, `pointer-events-none`
