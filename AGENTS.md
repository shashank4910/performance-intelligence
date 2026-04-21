# Agent / automation notes

Use this file with Cursor, Codex, or other coding agents working on this repository.

## Keep context lean (lower token load)

- **Prefer pointers over pastes:** Put long specs in `docs/` and link them; do **not** duplicate big tables, CSS themes, or transcripts inside `.cursor/rules/`.
- **Rules:** `.cursor/rules/*.mdc` should stay short. Use `alwaysApply: false` + **globs** so heavy rules load only when editing matching paths (see `design.mdc` → `.superdesign/**`).
- **Deep work:** For big tasks, read `docs/AI_CONTEXT.md`, `docs/FEATURE_REGISTRY.md`, `docs/SYSTEM_STATE.md` on demand — not every line in every session unless the change needs it.

## Must read before large edits

1. `docs/AI_CONTEXT.md` — product boundaries and constraints  
2. `docs/FEATURE_REGISTRY.md` — file map  
3. `docs/SYSTEM_STATE.md` — current behavior and known issues  

## Run / verify

- Install: `npm install`
- Dev: `npm run dev` (restart after `.env.local`, `next.config`, or Prisma client changes — see `.cursor/rules/`)
- Quality bar: `npm run lint`, `npm run build`, `npm test` when touching logic or types

## Do not touch without explicit instruction

- Phrase pool **mechanism** in `lib/competitorPhrasePools.ts` (hashing, exports) unless the task says so  
- Locked revenue model rules in `docs/DECISION_LOG.md`  
- Raw scoring formulas in `engine/competitorAnalysis.ts` unless the task is to change scoring  

## Where things live

- **Analyze pipeline:** `app/api/analyze/route.ts`  
- **Revenue / CORTEX / behavior:** `lib/impactEngine/`  
- **Metric drawer + recommendations:** `components/DetailedMetricsBoard.tsx`  
- **Competitor engine:** `engine/competitorAnalysis.ts`; API `app/api/competitor-analysis/`  
- **Competitor UI + decision copy wiring:** `app/dashboard/[projectId]/page.tsx`, `lib/competitorDecisionIntel.ts`  
- **Auth:** `lib/auth.ts`, `app/api/auth/`  
- **DB:** `prisma/schema.prisma`, `lib/prisma.ts`  

## Secrets

Never commit `.env.local`. Use `.env.example` for variable names only.

## Rules refresh

Review `.cursor/rules` periodically; remove stale rules when workflows change. Prefer **scoped globs** + short bodies so rules are not bundled into every chat.
