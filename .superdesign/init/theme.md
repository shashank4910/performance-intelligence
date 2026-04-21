# Theme & tokens

## Tailwind

- **Tailwind v4** via `@import "tailwindcss"` in `app/globals.css`.
- **No** `tailwind.config.ts` — theme extended with `@theme inline` in `globals.css`.

## Fonts (next/font)

- `--font-geist-sans`, `--font-geist-mono` (root layout body).
- `--font-inter` (optional homepage / marketing).
- Dashboard: `--font-dashboard` (Inter weights 400–700).

## Full `app/globals.css`

See repository `app/globals.css` for complete contents including:

- `:root` — `--background`, `--foreground`, `--card`, `--accent`, `--accent-secondary`, `--muted`, `--success`, `--warning`, `--danger`, etc.
- `.bg-dashboard`, `.bg-grid`, `.card-glass`, `.card-premium`, `.gradient-text-accent`
- `.sidebar-item-active`
- `.home-premium`, `.home-3d-lift`, `.home-hero-scene`, `.home-float-soft` (homepage 3D)

**Homepage marketing background token:** `#0B0F17` (class `home-premium` / inline in page).

## Reference: `.superdesign/design-system.md`

Summarizes cards, buttons, paywall blur — keep in sync for Superdesign drafts.
