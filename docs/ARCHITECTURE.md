# Performance Intelligence Engine — System Architecture

Last updated: 2026-03-14

This document explains the architecture of the Performance Intelligence SaaS platform.

The goal of this document is to help developers and AI tools understand:

• System structure  
• Data flow  
• Intelligence pipeline  
• Monetization boundaries  
• Critical logic components  

The product is **not a developer tool**.  
It is a **business intelligence platform that translates performance diagnostics into revenue impact insights.**

---

# 1. SYSTEM OVERVIEW

Performance Intelligence analyzes a website using Lighthouse data and converts performance metrics into business intelligence:

```
Website URL
      ↓
PageSpeed / Lighthouse audit
      ↓
Metric extraction
      ↓
Risk scoring
      ↓
Revenue leak attribution
      ↓
Resource attribution
      ↓
Recommendation engine
      ↓
User dashboard
```

The system translates technical performance metrics into:

• Revenue risk  
• Conversion impact  
• Business prioritization  
• Actionable fix recommendations  

---

# 2. CORE SYSTEM COMPONENTS

The platform consists of five major layers.

---

# A. Data Acquisition Layer

Responsible for collecting performance data.

### Source

Google PageSpeed Insights API

```
GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
```

Two runs are typically executed:

```
mobile strategy
desktop strategy
```

Returned data includes:

• Lighthouse audits  
• Performance metrics  
• Resource details  
• Network timing  

---

# B. Metric Intelligence Layer

Transforms raw Lighthouse audit data into structured metrics.

Location:

```
lib/metricIntelligenceEngine.ts
```

This layer extracts:

```
LCP
FCP
TTI
TBT
CLS
Speed Index
Main Thread Work
Bootup Time
TTFB
```

Output format:

```
cleanMetrics
detailedMetrics
metrics_for_dashboard
```

---

# C. Risk Engine

Location:

```
lib/riskEngine.ts
```

Converts performance metrics into risk scores.

Example categories:

```
Speed risk
UX risk
SEO risk
Conversion risk
Scaling risk
```

Scores range from:

```
0 — No risk
100 — Critical risk
```

Risk categories are combined into an **overall health score**.

---

# D. Revenue Intelligence Engine (CORTEX)

Location:

```
lib/impactEngine/
```

This engine translates performance degradation into **revenue loss estimates**.

Core logic:

```
computeCortexV2()
```

Inputs:

```
cleanMetrics
monthlyRevenue
traffic
conversion assumptions
```

Outputs:

```
estimatedMonthlyLeak
leak_by_metric
diagnostics
```

Revenue leak represents **lost conversions due to performance friction**.

---

# E. Resource Attribution Engine

Location:

```
lib/impactEngine/revenueLeakCalculator.ts
```

Distributes metric-level revenue leak across contributing resources.

Example:

```
Metric leak: $600
Resources:

scriptA.js → $200
imageB.jpg → $150
fontC.woff → $120
```

Attribution formula uses weighted factors:

```
resource size
execution time
metric influence
```

---

# F. Recommendation Engine

Location:

```
components/DetailedMetricsBoard.tsx — getMetricResourceRecommendation()
```

Also: `components/RevenueRecoveryOpportunities.tsx` (getRecommendationCopy) and `lib/revenueRecoveryLabels.ts` (getActionTitleForResource, getImprovesLabelsForMetric) for Revenue Recovery cards.

Generates deterministic optimization recommendations for each resource.

Input:

```
metricLabel
resource.type
transferSize
executionTimeMs
causeType
```

Output:

```
action
why
technicalDetails
```

Recommendations are deterministic rules, not random AI text.

---

# 3. UI SYSTEM

The main analysis UI lives in:

```
components/DetailedMetricsBoard.tsx
```

Each metric opens a **drawer panel**.

Drawer contains two modes:

```
Technical Breakdown
Financial Forensic Audit
```

---

# Technical Breakdown

Focus:

```
What is happening technically
```

Content:

• Metric explanation  
• Impact level  
• Contributing resources  

---

# Financial Forensic Audit

Focus:

```
What revenue is being lost
```

Content:

• Estimated revenue leak  
• Resource attribution  
• Optimization recommendations  

---

# 4. FREE VS PRO MONETIZATION MODEL

This platform uses a **diagnostic → action paywall model**.

Free tier provides **diagnosis**.

Pro tier provides **actionable intelligence**.

**Pro check:** `userPlan === "pro"` (from stored analysis data) OR `localStorage.getItem("demoPro") === "true"`. Set in `app/dashboard/[projectId]/page.tsx`, `app/financial-report/page.tsx`, `app/report/page.tsx`. Revenue Recovery and financial-report show `LockedRevenueRecovery` when not Pro. See `docs/FEATURE_REGISTRY.md` — Paywall System.

---

## FREE TIER ALLOWS

Users can see:

• metric explanations  
• performance impact description  
• grouped resource categories  

Example:

```
JavaScript execution bundles (4)
Third-party scripts (3)
Web fonts blocking render (2)
```

---

## FREE TIER MUST NOT SHOW

Free tier must never reveal:

```
specific resource URLs
revenue attribution
technical fix instructions
optimization strategies
```

---

## PRO TIER UNLOCKS

Pro tier shows:

```
exact resource files
revenue leak attribution
technical optimization recommendations
expected improvement
```

Example:

```
gtm.js → $202/month leak
Recommended fix → load after first paint
```

---

# 5. RECOMMENDATION STRUCTURE

Each recommendation includes three parts.

```
WHY THIS MATTERS
RECOMMENDED FIX
EXPECTED IMPROVEMENT
```

Example:

```
WHY THIS MATTERS
Interaction delay causes users to abandon the page.

RECOMMENDED FIX
Split this script using dynamic import or load after interaction.

EXPECTED IMPROVEMENT
Recover $202/mo in TTI revenue.
```

---

# 6. PRIORITY SCORING

Each resource receives a priority score.

Location:

```
components/DetailedMetricsBoard.tsx — computePriorityScores(resources, attributedAmounts)
```

Formula (normalized then weighted):

```
normalizedLeak = leak / maxLeak, normalizedExec = execMs / maxExec, normalizedSize = size / maxSize
score = 0.5 * normalizedLeak + 0.3 * normalizedExec + 0.2 * normalizedSize
priorityScore = min(100, round(score * 100))
```

Scores are in range 0–100. Higher score = higher fix priority.

---

# 7. CONFIDENCE MODEL

Confidence indicates how strongly a resource contributes to revenue loss.

Location:

```
getConfidenceForResource()
```

Formula:

```
weight = resourceLeak / metricLeak
```

Rules:

```
weight > 0.6 → High confidence
weight > 0.3 → Medium confidence
else → Low confidence
```

Confidence explanation is shown to users.

Example:

```
Low confidence • multiple resources contribute to this delay
```

---

# 8. STORAGE

Database:

```
PostgreSQL
```

ORM:

```
Prisma
```

Tables:

```
User
Project
ProjectBusinessProfile
PerformanceSnapshot
```

Snapshots store historical performance data.

---

# 9. CACHING

Location:

```
lib/cache.ts
```

Analysis results are cached for:

```
10 minutes
```

Purpose:

```
reduce PageSpeed API calls
speed up repeat analysis
```

---

# 10. RATE LIMITING

Location:

```
lib/rateLimit.ts
```

Limit:

```
10 analyze requests per minute per IP
```

---

# 11. DESIGN PRINCIPLES

The system follows five core principles.

### 1. Business-first intelligence

Every output must answer:

```
How does this affect revenue?
```

---

### 2. Deterministic logic

Recommendations must be rule-based, not random AI text.

---

### 3. Minimal UI clutter

The interface should remain calm and analytical.

---

### 4. Monetization boundary

Free tier diagnoses problems.

Pro tier explains **how to fix them**.

---

### 5. Founder-level clarity

Insights should help founders prioritize fixes without deep technical knowledge.

---

# 12. FUTURE EXTENSIONS

Planned improvements include:

```
competitor benchmarking
historical performance trends
conversion impact modeling
performance opportunity scoring
```

These features will expand the intelligence layer without changing core architecture.

