# AI prompt templates (for humans)

Use these patterns when asking an AI to work in this repo. They improve **relevant context** and reduce wrong edits.

## 1. Refactor / feature (replace bracketed parts)

```
Goal: [one sentence]

Allowed paths: [e.g. app/dashboard/, lib/competitorDecisionIntel.ts]
Forbidden: [e.g. do not change engine/competitorAnalysis.ts scoring]

Read before editing:
- docs/AI_CONTEXT.md
- docs/FEATURE_REGISTRY.md (sections: [names])

Acceptance:
- npm run lint passes
- npm run build passes
- [behavioral check]
```

## 2. Bugfix

```
Symptom: [what the user sees]
Expected: [correct behavior]

Reproduce:
1. [steps]
Command: [e.g. npm run dev]

Paste full error (no paraphrase):
[paste terminal or browser error]

Files already checked: [optional]
```

## 3. Point the model at code first

```
@docs/FEATURE_REGISTRY.md
@app/dashboard/[projectId]/page.tsx

Task: […]
```

## 4. Habits that help (items 9–11 in the checklist)

- State **goal + allowed/forbidden paths** every time.
- **@** mention folders or paste **exact file paths** for first reads.
- Paste **full errors** and the **exact command** you ran.
