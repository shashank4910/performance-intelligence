# Performance Intelligence — AI Context

This file defines the architecture, philosophy, and constraints of the project.

Any AI modifying this codebase must follow these rules.

**Navigation:** For where major logic lives, see `docs/FEATURE_REGISTRY.md`. For current system state and known issues, see `docs/SYSTEM_STATE.md`. Repo map and flows: `docs/ONBOARDING.md`. How to keep docs current: `docs/DOCUMENTATION_MAINTENANCE.md`. Prompt patterns for AI-assisted work: `docs/AI_PROMPT_TEMPLATE.md`. Agent conventions: `AGENTS.md` (repo root).

---

# Product Mission

Performance Intelligence is a SaaS platform that converts technical website performance data into **business intelligence**.

The product answers three questions:

1. Where is revenue being lost due to performance?
2. Which resources cause that loss?
3. What fixes recover the most revenue?

The system is **not a developer tool**.

It is a **revenue intelligence platform for founders and product owners**.

---

# Core Product Principles

1. **Business-first, not metric-first**

Do not surface raw Lighthouse metrics without business interpretation.

Always translate metrics into:

- revenue risk
- user behavior impact
- business consequence

---

2. **Decision clarity over data volume**

The interface must remain minimal.

Avoid adding:

- extra dashboards
- unnecessary charts
- complex analytics panels

Instead prioritize:

- clear fixes
- prioritized actions
- revenue recovery estimates

---

3. **Deterministic diagnostics over AI hallucination**

Root cause analysis must rely primarily on:

- Lighthouse audits
- resource attribution
- deterministic logic

AI should only assist with:

- explanation
- narrative
- communication

AI must not invent technical causes.

---

4. **Resource-level intelligence**

The system must diagnose issues at the **resource level**, not only at the metric level.

Example:

Bad:
"LCP is slow"

Good:
"hero-image.webp delays LCP by 1.4 seconds"

---

5. **Prioritization is mandatory**

Every diagnostic output must answer:

"What should be fixed first?"

Resources must be ranked by impact using:

- revenue leak
- execution time
- transfer size
- user experience severity

---

# System Architecture

The system consists of five engines.

### 1. Performance Diagnostics Engine

Source: Lighthouse / PageSpeed.

Produces:

- metric values
- resource attribution
- audit data

---

### 2. Risk Engine

Converts performance metrics into risk scores.

Example categories:

- Speed risk
- UX risk
- Conversion risk
- Scaling risk

---

### 3. Revenue Impact Engine (CORTEX)

Maps performance friction to revenue loss.

Stages:

- Visual Frustration
- Interaction Paralysis
- Trust Erosion
- Infrastructure Debt

---

### 4. Recommendation Engine

Produces deterministic technical fixes based on:

- resource type
- metric affected
- performance characteristics

Avoid generic advice.

Recommendations must be contextual.

---

### 5. Narrative Engine

Uses AI to translate technical diagnostics into business language.

Used for:

- executive summary
- "why it matters" explanations

AI must not invent technical causes.

---

# UI Philosophy

The UI must remain **clean and minimal**.

Avoid adding new dashboard sections unless absolutely necessary.

Preferred structure:

1. Overall health
2. Revenue impact
3. Metrics dashboard
4. Metric drawer diagnostics

Avoid clutter.

---

# Code Design Rules

1. Prefer deterministic logic over AI reasoning.
2. Use typed structures when possible.
3. Keep recommendation logic centralized.
4. Avoid duplicating recommendation rules.
5. Separate data computation from UI rendering.

---

# Recommendation Engine Rules

Recommendations must use available context:

- resource.url
- resource.type
- resource.transferSize
- resource.executionTimeMs
- resource.affects

Generic suggestions like:

"Optimize this resource"

are not acceptable.

Each recommendation must explain:

- what the problem is
- why it matters
- how to fix it

---

# Revenue Intelligence Rules

Revenue estimates must include context.

Every revenue number must connect to:

- user behavior
- metric degradation
- resource impact

Avoid presenting numbers without explanation.

---

# Design Constraints

Do NOT:

- turn this product into a Lighthouse clone
- overload the UI with technical data
- add features that do not connect to business outcomes

---

# Long-Term Vision

The product will evolve into a **Performance Intelligence Platform** including:

- performance history
- revenue recovery tracking
- competitive benchmarking
- performance ROI analytics

---

# AI Modification Rules

Any AI editing this codebase must ensure:

1. Recommendations remain deterministic.
2. UI remains uncluttered.
3. Diagnostics remain resource-focused.
4. Business impact remains visible.

If unsure, prefer **clarity over complexity**.
