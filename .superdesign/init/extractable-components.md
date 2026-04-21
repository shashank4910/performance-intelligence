# Extractable components (homepage)

## HomeHeader (conceptual)

- **Source:** `app/page.tsx` (sticky header block + mobile overlay)
- **Category:** layout
- **Description:** Logo + desktop nav (Analyze, Dashboard, History) + hamburger
- **Props:** `isLoggedIn`, `onHistoryGuest`, `onOpenMenu`, `onNavigateAnalyze`
- **Hardcoded:** "Performance Intelligence" label, link targets

## HeroDashboardPreview

- **Source:** `components/home/HeroDashboardPreview.tsx`
- **Category:** basic (hero visual)
- **Description:** 3D stacked dashboard mock with parallax
- **Props:** none (self-contained)
- **Hardcoded:** Illustrative metrics, card copy

## HeroPreview (inline)

- **Source:** `app/page.tsx`
- **Category:** basic
- **Description:** Compact health / revenue / top issue from API
- **Props:** `data: HeroPreviewData`
- **Hardcoded:** layout classes

---

For Superdesign flows, prefer extracting **HeroDashboardPreview** and **header** patterns after pixel-perfect reproduction of current `app/page.tsx`.
