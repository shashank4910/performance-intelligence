# Performance Intelligence

SaaS that turns Lighthouse/PageSpeed data into **business intelligence**: revenue risk, resource-level attribution, and prioritized fixes. Target users are founders and product owners—not a generic Lighthouse dashboard.

## Quick start

```bash
npm install
cp .env.example .env.local
# Edit .env.local — see Environment below
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Documentation (read these first)

| Doc | Purpose |
|-----|---------|
| [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) | Product mission, principles, AI editing rules |
| [docs/FEATURE_REGISTRY.md](docs/FEATURE_REGISTRY.md) | Where major logic lives (navigation index) |
| [docs/SYSTEM_STATE.md](docs/SYSTEM_STATE.md) | What’s built, known issues, planned work |
| [docs/DECISION_LOG.md](docs/DECISION_LOG.md) | Locked product/engineering decisions |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Repo layout and main user/data flows |
| [docs/DOCUMENTATION_MAINTENANCE.md](docs/DOCUMENTATION_MAINTENANCE.md) | How to keep docs current (PR checklist) |
| [docs/AI_PROMPT_TEMPLATE.md](docs/AI_PROMPT_TEMPLATE.md) | Copy-paste prompts for AI-assisted work |
| [AGENTS.md](AGENTS.md) | Conventions for AI agents and automation |

## Environment

Copy `.env.example` to `.env.local` and fill values. Never commit secrets.

- **`DATABASE_URL`** — Postgres (e.g. Supabase); required for auth and saved projects.
- **`NEXTAUTH_SECRET`** — Required for NextAuth (`openssl rand -base64 32`).
- **`PAGESPEED_API_KEY`** or **`GOOGLE_API_KEY`** — PageSpeed Insights (analyze, competitor flows).
- **`OPENAI_API_KEY`** — Optional; powers narrative/diagnosis routes when present.

Details: `.env.example` and [docs/FEATURE_REGISTRY.md](docs/FEATURE_REGISTRY.md) (Environment section).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint |
| `npm test` | Jest tests |
| `npm run db:push` | Sync Prisma schema to database |

Run `npm run build` and `npm run lint` before merging non-trivial changes.

## Tech stack

Next.js (App Router), React, Prisma + Postgres, NextAuth, Tailwind.

## Contributing

See [docs/DOCUMENTATION_MAINTENANCE.md](docs/DOCUMENTATION_MAINTENANCE.md) and `.github/pull_request_template.md`. Update `docs/FEATURE_REGISTRY.md` or `docs/SYSTEM_STATE.md` when behavior or file locations change.
