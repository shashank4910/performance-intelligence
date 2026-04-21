# Design System — Performance Intelligence

## Colors (CSS variables)

| Token | Value | Usage |
|-------|--------|--------|
| `--background` | `#070b14` | Page background (deep matte navy) |
| `--foreground` | `#F8FAFC` | Primary text |
| `--card` | `rgba(15, 23, 42, 0.65)` | Card/surface background |
| `--card-border` | `rgba(255, 255, 255, 0.06)` | Subtle borders |
| `--accent` | `#3B82F6` | Primary CTA, links, revenue highlights |
| `--accent-dim` | `#2563EB` | Hover/pressed accent |
| `--accent-secondary` | `#06B6D4` | Secondary accent (gradients) |
| `--muted` | `#64748B` | Secondary text, labels |
| `--glow` | `rgba(59, 130, 246, 0.12)` | Soft focus/primary glow |
| `--success` | `#10b981` | Positive state |
| `--warning` | `#d97706` | Warning state |
| `--danger` | `#dc2626` | Error/critical |

## Typography

- **Font:** Geist Sans (--font-geist-sans), system-ui fallback
- **Headings:** `text-lg font-semibold` (section), `text-base font-semibold` (card title)
- **Body:** `text-sm`; muted copy `text-sm text-[var(--muted)]`
- **Labels:** `text-xs` or `text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]`

## Spacing & layout

- Section spacing: `space-y-4` (16px) or `space-y-6` (24px)
- Card padding: `p-5` or `p-6`
- Border radius: cards `rounded-xl`, buttons `rounded-lg`, badges `rounded-md`
- Max content width: `max-w-4xl` for reading; dashboard full width

## Components (patterns)

### Card (default)
- `rounded-xl border border-white/10 bg-white/[0.03] p-5`
- Optional: `border-[var(--card-border)]`, `bg-[var(--card)]`

### Accent card (CTA / highlight)
- `rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-6`
- Use for upgrade CTA, key actions

### Primary button
- `rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90`
- Focus: `focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50`

### Revenue badge
- `rounded-lg bg-[var(--accent)]/15 px-3 py-2`; value `text-lg font-semibold tabular-nums text-[var(--accent)]`

### Blur (paywall)
- Soft: `blur-[6px]` for description-only blur
- Strong: `blur-md` for full-card preview
- Always pair with `select-none pointer-events-none` on blurred content

## Paywall pattern

- **Visible:** First N items full content (no blur).
- **Locked:** Remaining items show Fix #, Title, Revenue badge (sharp); description area only in `blur-[6px]` container.
- **CTA:** Directly below locked strip; accent border + accent/10 background; heading + one line copy + "Upgrade to Pro" button.
