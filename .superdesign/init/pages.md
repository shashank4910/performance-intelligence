# Home page (`/`) — dependency tree

**Entry:** `app/page.tsx` (client component)

```
app/page.tsx
├── next/navigation (useRouter)
├── next/link
├── next-auth/react (useSession)
├── @/lib/projectClientStorage (setProjectReportJson)
├── @/components/home/HeroDashboardPreview.tsx
│   └── (React hooks only; no sub-components)
```

**In-file UI (not imported):**

- `HeroPreview` — live snapshot when `analysisResult` present (before redirect)
- Inline sections: header, hero, problem cards, solution steps, output preview tabs, priority table, analyzer form, auth modal

**Styles:** `app/globals.css` — `.home-premium`, `.home-3d-lift`, `.home-hero-scene`, `.home-float-soft`

**No** root layout nav on home — page implements its own sticky header + mobile drawer.
