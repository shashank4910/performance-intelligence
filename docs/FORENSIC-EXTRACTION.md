# PERFORMANCE INTELLIGENCE — FORENSIC EXTRACTION

Backup-grade technical documentation to recreate the project from scratch.

---

## 1. PROJECT OVERVIEW

**What it does:** Next.js app that analyzes URLs via Google PageSpeed, computes risk/health scores (speed, UX, SEO, conversion, scaling), estimates revenue impact (legacy in analyze route + funnel-aware impact engine), stores snapshots for logged-in users (PostgreSQL/Prisma), and serves dashboards + Revenue Impact workspace. Uses OpenAI for narrative only (executive summary, briefs, metric explanation, diagnosis, competitive insight).

**Core purpose:** Let users analyze site performance, see risk breakdowns, revenue impact, compare competitors, and run funnel-aware revenue simulations with optional stale detection.

**Main flow:** Home → analyze (GET /api/analyze) → if guest: localStorage + /report (locked); if auth: snapshot saved, sessionStorage + /dashboard/{projectId}. Dashboard reads sessionStorage; Revenue Impact at /dashboard/{projectId}/revenue-impact runs runImpactEngine in memory, PATCHes profile (modelVersion, lastRunAt, lastSnapshotTimestamp).

**Entry points:** /, /report, /dashboard, /dashboard/[projectId], /dashboard/[projectId]/revenue-impact, /login, /auth/signup, /performance-history; APIs: /api/analyze, /api/compare, /api/auth/[...nextauth], /api/signup, /api/save-pending-result, /api/project-business-profile, /api/projects/[projectId], /api/strategic-brief, /api/strategic-cell-refinement, /api/metric-explanation, /api/diagnosis-summary, /api/competitive-intelligence.

**Architecture:** Next.js 16 App Router, React 19, API routes (serverless), PostgreSQL via Prisma 7 (pg + @prisma/adapter-pg), NextAuth credentials + JWT, PageSpeed v5 + OpenAI.

---

## 2. FILE STRUCTURE (CRITICAL ONLY)

- **app/api/analyze/route.ts** — PageSpeed + risk + revenue + snapshot save.
- **app/api/auth/[...nextauth]/route.ts** — NextAuth.
- **app/api/compare/route.ts** — Multi-URL compare.
- **app/api/project-business-profile/route.ts** — GET/POST/PATCH profile.
- **app/api/projects/[projectId]/route.ts** — Project + last snapshot.
- **app/api/signup/route.ts**, **app/api/save-pending-result/route.ts** — Auth + guest save.
- **app/dashboard/layout.tsx** — Auth guard, sidebar.
- **app/dashboard/[projectId]/page.tsx** — Report from sessionStorage.
- **app/dashboard/[projectId]/revenue-impact/page.tsx** — RevenueImpactWorkspace.
- **lib/auth.ts**, **lib/prisma.ts**, **lib/project.ts**, **lib/riskEngine.ts** — Auth, DB, project, risk.
- **impactEngine/** — impactEngineService, revenueProjectionEngine, businessModelRegistry, funnelTemplates, sensitivityModels, projectBusinessProfileService, impactTypes, competitorOverlayEngine.
- **lib/strategicGrowthMatrix.ts**, **lib/primaryStageFromDrivers.ts** — Matrix + primary stage.
- **prisma/schema.prisma** — Full DB schema.
- **components/RevenueImpactWorkspace.tsx**, **StrategicMapView.tsx**, **DashboardSidebar.tsx**, **RevenueImpactCard.tsx**.

No middleware file. No prisma/migrations (use `npx prisma db push`).

---

## 3. FRONTEND

- **Framework:** Next.js 16, React 19. **State:** React state + sessionStorage (pi:project:{projectId}) + localStorage (pendingAnalysisResult). **Auth:** useSession (next-auth/react).
- **Protected routes:** dashboard/layout.tsx getServerSession → redirect /login. APIs check session for profile/projects/save-pending/brief/refinement.
- **Guest:** Analyze without login → result in localStorage → /report with ReportLockWrapper (blur + signup CTA).
- **Dashboard:** Scroll-spy via DashboardNavContext; sidebar links to #sections or /dashboard/{id}/revenue-impact.

---

## 4. BACKEND

- **Rate limit:** lib/rateLimit.ts — 10 req/min per IP (x-forwarded-for); used by analyze, compare, metric-explanation, diagnosis-summary, competitive-intelligence. Returns 429 when exceeded.
- **Validation:** analyze: url required; signup: email/password, len≥8; profile POST: projectId, businessModelId, monthlyRevenue; PATCH: lastCalculatedOpportunity (low/expected/high), lastConfidence.
- **Errors:** 400/401/404/429/500; try/catch; fallbacks for OpenAI.

---

## 5. DATABASE (FULL SCHEMA)

**ORM:** Prisma 7. **Connection:** lib/prisma.ts — DATABASE_URL, pg Pool, PrismaPg adapter; dev + Supabase: NODE_TLS_REJECT_UNAUTHORIZED=0, ssl rejectUnauthorized false.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql" }

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  projects  Project[]
  @@map("user")
}

model Project {
  id              String                  @id @default(cuid())
  url             String
  industry        String?
  createdAt       DateTime                @default(now())
  userId          String
  user            User                    @relation(fields: [userId], references: [id], onDelete: Cascade)
  snapshots       PerformanceSnapshot[]
  businessProfile ProjectBusinessProfile?
  @@map("project")
}

model ProjectBusinessProfile {
  id                       String    @id @default(cuid())
  projectId                String    @unique
  project                  Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  businessModelId          String
  monthlyRevenue           Decimal   @db.Decimal(14, 2)
  advancedInputs           Json?
  sensitivityMode          String
  lastCalculatedOpportunity Json?
  lastConfidence           String?
  modelVersion             String?
  lastRunAt                DateTime?
  lastSnapshotTimestamp    DateTime?
  updatedAt                DateTime  @updatedAt
  @@map("project_business_profile")
}

model PerformanceSnapshot {
  id            String   @id @default(cuid())
  projectId     String
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  timestamp     DateTime @default(now())
  overallHealth Float?
  lcp           Float?
  inp           Float?
  ttfb          Float?
  cls           Float?
  tbt           Float?
  revenueRisk   Float?
  moatScore     Float?
  domainScores  Json?
  competitive   Json?
  rawAudit      Json?
  @@map("performance_snapshot")
}
```

No indexes beyond PK/unique. No migrations in repo — use `npx prisma db push`.

---

## 6. ENVIRONMENT VARIABLES

| Variable | Required | Where | Purpose |
|----------|----------|--------|---------|
| DATABASE_URL | Yes | lib/prisma.ts, prisma.config.ts | PostgreSQL |
| NEXTAUTH_SECRET | Yes | lib/auth.ts | JWT signing |
| PAGESPEED_API_KEY | Yes (analyze/compare/competitive) | analyze, compare, competitive-intelligence | PageSpeed v5 |
| OPENAI_API_KEY | No (fallbacks) | analyze, strategic-brief, strategic-cell-refinement, diagnosis-summary, competitive-intelligence, metricAIExplanation | OpenAI |
| NODE_ENV | No | prisma, signup | Log level, errors |

---

## 7. BUSINESS LOGIC (FORMULAS)

**Risk (lib/riskEngine.ts):** linearRisk(v, low, high) = 0 if v≤low, 100 if v≥high, else linear. clampScore = round(clamp(v,0,100)).
- Speed: 0.4*lcpRisk(2500,5000)+0.35*tbtRisk(300,600)+0.25*speedIndexRisk(3000,6000).
- UX: 0.4*clsRisk(0.1,0.25)+0.35*inpRisk(200,500)+0.25*tbtRisk.
- SEO: 0.5*lcpRisk+0.25*fcpRisk(1800,3000)+0.25*speedIndexRisk.
- Conversion: 0.35*lcp+0.35*inp+0.3*tbt.
- Scaling: 0.35*domRisk(1500,3000)+0.35*mainThreadRisk(3000,6000)+0.3*tbt.
- Overall health: 100 − weighted sum (speed 0.3, ux 0.25, seo 0.15, conversion 0.2, scaling 0.1).

**Revenue risk:** base = 0.4*speed+0.4*conversion+0.2*ux; LCP/INP severity + mobile weight adjustment; clampScore. Levels: ≥75 Critical, ≥50 High, ≥30 Moderate.

**Revenue projection (impactEngine):** gapFromIdeal(health); lcpImpact/timingImpact/clsImpact; INFLUENCE_FACTOR high/medium/low → score per stage×metric; totalInfluence *= ELASTICITY_MULTIPLIER (conservative 0.75, balanced 1, aggressive 1.25); cap 0.35; rawOpportunityPct = min(cap, totalInfluence + healthGap*0.08); toOpportunityRange: low 0.6×, expected 1×, high 1.4×.

**Strategic matrix:** cellScore = stageWeight × sensitivityValue × normalizedPerformanceGap × normalizedStageInfluenceFromEngine; intensity 0–0.33 low, 0.34–0.66 medium, 0.67–1 high; blue only.

**Primary stage:** primaryDrivers grouped by stage; sum influence (high 3, medium 2, low 1); max sum = primaryStage.

---

## 8. EXTERNAL INTEGRATIONS

- **PageSpeed:** GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=...&strategy=mobile|desktop&key=PAGESPEED_API_KEY. Response: lighthouseResult.audits, categories.performance.score.
- **OpenAI:** gpt-4o-mini, temperature 0.2–0.3; JSON or text per route; fallbacks when key missing or error.

---

## 9. AUTH & USER

- User: id, email (unique), password (bcrypt 12), createdAt. NextAuth Credentials; JWT 30 days; session.user.id, session.user.email. No roles.

---

## 10. PERFORMANCE HISTORY

- Snapshots: prisma.performanceSnapshot.create on analyze (auth); save-pending-result for guest after signup. getLastSnapshots(projectId, 2); computePerformanceDelta(current, previous) → performanceChange in analyze response. No trend UI/chart.

---

## 11. ERROR HANDLING

- 400 validation/JSON; 401 auth; 404; 429 rate limit; 500 + message. Lighthouse fail → 500; desktop run catch → keep mobile. OpenAI fallbacks.

---

## 12. DEPLOYMENT

- Build: `npm run build`. Start: `npm run start`. Env: .env / .env.local; prisma.config.ts loads both. No CI/CD or Docker in repo.

---

## 13. SECURITY

- URL validation; signup trim/lower email, password length; projectId via getProjectForUser(userId). API keys server-side. bcrypt 12.

---

## 14. REBUILD STEPS

1. Clone; Node 20+; `npm install`.
2. `.env.local`: DATABASE_URL, NEXTAUTH_SECRET, PAGESPEED_API_KEY, OPENAI_API_KEY (optional).
3. `npx prisma db push` then `npx prisma generate`.
4. `npm run dev`; test GET /api/analyze?url=https://example.com&revenue=0&mobileShare=100&industry=general.
5. Signup → login → analyze → dashboard; Revenue Impact at /dashboard/{projectId}/revenue-impact.
