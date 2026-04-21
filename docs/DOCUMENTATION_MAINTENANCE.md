# Documentation maintenance (Definition of Done for docs)

Use this checklist for non-trivial PRs and releases.

## After every meaningful change

- [ ] **`docs/FEATURE_REGISTRY.md`** — Add or update the row for the feature (path + purpose).
- [ ] **`docs/SYSTEM_STATE.md`** — If behavior, scope, or known issues changed, update the relevant section and bump **Last updated**.

## When you change a locked decision

- [ ] **`docs/DECISION_LOG.md`** — New dated entry (decision, reason, what it replaces).

## When you add env vars or scripts

- [ ] **`.env.example`** — Variable name + one-line comment (no secrets).
- [ ] **`README.md`** — If the variable is required for local dev or CI.

## Quarterly (calendar reminder)

- [ ] **`.cursor/rules`** — Remove or update stale rules.
- [ ] **`docs/SYSTEM_STATE.md` “Known issues”** — Close fixed items; add new ones.

## Optional but recommended

- [ ] **`docs/ONBOARDING.md`** — Update the ASCII flow if main routes or engines move.
