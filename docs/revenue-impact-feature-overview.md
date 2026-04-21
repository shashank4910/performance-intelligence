# Revenue Impact Feature — Overview (Source of Truth)

This document explains the Revenue Impact feature so we stay in sync and avoid confusion or deviations from the plan.

---

## 1. Purpose

- **Translate performance gaps into revenue impact** using clear, direct language.
- **No auto-calculation on the dashboard** — simulation runs only when the user clicks **Run simulation** in the dedicated workspace.
- **One-time result** — results do not auto-update when performance data changes; the user must re-run to refresh.
- **Opportunity framing only** — we talk about “revenue opportunity” and “uplift,” not “revenue loss” or scare language.

---

## 2. What We Do NOT Do (Strict Boundaries)

- **Do not modify** the impact engine logic, sensitivity models, scoring engine, or metric intelligence.
- **Do not change** Lighthouse processing or authentication.
- **Do not change** the deterministic opportunity math inside `impactEngine/`.
- **Do not run** the impact engine automatically from the dashboard or report; it runs only from the workspace when the user clicks **Run simulation**.
- **Do not auto-recalculate** when performance snapshot or business inputs change; the user must click **Run simulation** again.
- **Do not** show a single-point revenue prediction; we always show ranges (low / expected / high) and confidence.

---

## 3. Where the Feature Appears

| Place | What the user sees |
|-------|--------------------|
| **Dashboard project page** (`/dashboard/[projectId]`) | Revenue Impact **section** with **Revenue Impact Card**. |
| **Report page** (`/report`) | Same **Revenue Impact Card** (no `projectId`; link goes to `/dashboard`). |
| **Sidebar** (when on a project page) | **“Revenue Impact”** link goes to the **Revenue Impact Workspace** (`/dashboard/[projectId]/revenue-impact`). |
| **Revenue Impact Workspace** (`/dashboard/[projectId]/revenue-impact`) | Full simulation UI: business context, performance snapshot, **Run simulation**, then results (Strategic Map + Financial Projection). |

The **card** is the entry point: it either invites the user to configure and run a simulation or shows last-calculated opportunity and a link to the workspace. The **workspace** is where configuration, run, and results live.

---

## 4. Revenue Impact Card (Dashboard Entry)

- **If no business profile exists for the project:**  
  Shows “Revenue Impact Simulation”, short description, and a single CTA: **Configure & Run Simulation →**.  
  Does **not** call the impact engine or show numbers.

- **If a business profile exists:**  
  Shows: Business model, Monthly revenue, Last calculated opportunity (if any), Confidence, and **Open Simulation Workspace →**.

- **Link behavior:**  
  Opens `/dashboard/[projectId]/revenue-impact`. When `projectId` is present, the link can open in a new tab (`target="_blank"`).

- **No auto-run:**  
  The card never calls `runImpactEngine`. It only reads the saved profile and last result from the API.

---

## 5. Data: Project Business Profile (Database)

- **Table:** `project_business_profile` (via Prisma model `ProjectBusinessProfile`).
- **Stored per project:**  
  `projectId`, `businessModelId`, `monthlyRevenue`, `advancedInputs` (JSON), `sensitivityMode`, `lastCalculatedOpportunity` (JSON), `lastConfidence`, `updatedAt`.
- **Service:** `impactEngine/projectBusinessProfileService.ts`  
  - `getBusinessProfile(projectId)`  
  - `saveBusinessProfile(projectId, data)`  
  - `updateLastCalculation(projectId, opportunityData)`  
- **APIs:**  
  - `GET /api/project-business-profile?projectId=...` — get profile (auth required).  
  - `POST /api/project-business-profile` — save/upsert profile (auth required).  
  - `PATCH /api/project-business-profile` — update only last opportunity + confidence (auth required).

Business inputs are saved per project; the workspace auto-saves with a short debounce (e.g. 800 ms) and shows “Saving…” / “Saved ✓”. No schema changes to auth or other core tables beyond this additive table.

---

## 6. Revenue Impact Workspace (Page Structure)

Single page: **Revenue Impact Simulation** for one project. Sections in order:

1. **Header** — Title, project name, last updated (from business profile).
2. **Business context panel** — Business model (from registry), monthly revenue (required), sensitivity mode (conservative / balanced / aggressive), collapsible advanced inputs. Auto-save; no auto-run.
3. **Performance snapshot (context only)** — Read-only: overall health, LCP, TTI/INP, CLS. For context only; does not trigger simulation.
4. **Run simulation** — Single button. Only this action runs the impact engine and updates results.
5. **Results panel** — Shown only after a run. **View toggle:** [ Strategic Map ] [ Financial Projection ]. Default: **Strategic Map**.

---

## 7. Results: Two Views (Toggle)

### Strategic Map (default)

- **Strategic Growth Matrix** — Rows: funnel stages (Landing, Activation, Conversion). Columns: performance levers (Load Speed/LCP, Interaction/INP, Stability/CLS, Execution/Main Thread). Cells are **color only** (green / amber / red = low / medium / high impact). No numbers in cells. Overall health can be used so that when site health is low, the matrix does not appear mostly green.
- **Hover on a cell** — Floating panel with: Impact level, Revenue leverage, Industry position (deterministic); core explanation template; optional AI refinement (1–2 sentences, cached per cell).
- **Opportunity concentration** — Bar showing how much of the opportunity is concentrated by stage (e.g. Landing 67%, Activation 21%, Conversion 12%). Derived from deterministic stage contribution; visual only, no raw math.
- **Industry alignment scale** — Below Baseline | Baseline | Top Quartile | Best-in-Class; current tier marked (deterministic from benchmarks).
- **Strategic brief** — 6–8 line executive summary (AI when available; deterministic fallback otherwise). Explains where friction is, which stage to fix first, confidence. Fetched once per run; cached.
- Short **explanatory copy** for the matrix, opportunity concentration, industry alignment, and strategic brief so each element is clear.

### Financial Projection

- **Existing opportunity view** — Low / Expected / High opportunity range (from impact engine).
- **Enhancements:** % uplift vs monthly revenue (when baseline > 0), confidence tooltip, timestamp of simulation. No scare messaging; opportunity framing only.

Neither view recalculates until the user clicks **Run simulation** again.

---

## 8. When the Impact Engine Runs

- **Only in the workspace**, when the user clicks **Run simulation**.
- **Inputs:** Current business context (model, monthly revenue, advanced inputs), latest performance snapshot for the project (from API), no competitor overlay unless explicitly wired elsewhere.
- **Flow:**  
  1. Persist business profile (so we have a row to update).  
  2. Call `runImpactEngine(...)` (deterministic; no changes to this logic).  
  3. Persist result via `updateLastCalculation(projectId, { opportunityRange, confidenceLevel })`.  
  4. Show results in the chosen view (Strategic Map or Financial Projection).

The dashboard and report **never** call `runImpactEngine`. The card only shows stored profile and last result.

---

## 9. Strategic Matrix (UX Layer Only)

- Implemented in **`lib/strategicGrowthMatrix.ts`**.
- **Reads only:** funnel templates, sensitivity profiles, industry benchmarks, performance snapshot. **Does not** change revenue math or impact engine.
- Cell score combines: stage weight, metric sensitivity, performance delta vs benchmark, and (when implemented) overall health so that low site health can show more amber/red.
- Colors: low → soft green, medium → amber, high → red. No numeric display in cells.

---

## 10. Report Templates (Optional Output)

- **`lib/revenueImpactReportTemplate.ts`** — Two templates that **do not calculate**; they only plug in provided values.
  - **Executive-style report** — `renderRevenueImpactReport(data)` — 8 sections (revenue snapshot, metric comparison, why it impacts revenue, primary focus, expected outcome, industry position, confidence, snapshot reference).
  - **Founder-friendly report** — `renderFounderFriendlyRevenueReport(data)` — 9 sections (revenue snapshot, what it means, primary focus, metric gap, why it affects revenue, expected outcome, industry position, confidence, snapshot reference).
- Callers must supply all numbers (e.g. impact range, uplift, gap); the templates only format and insert them. Used when we want to generate a downloadable or printable report from workspace data.

---

## 11. Principles to Avoid Deviation

1. **Simulation is explicit** — Run only when the user clicks **Run simulation** in the workspace.
2. **Results are one-time** — No auto-refresh when performance or business inputs change.
3. **Opportunity only** — Ranges and uplift; no single-point prediction or fear-based messaging.
4. **Engine is untouched** — All revenue math stays in `impactEngine/`; we only call it and display results.
5. **Profile is per project** — Business context and last result stored in `project_business_profile`; dashboard card and workspace read/write via the same APIs.
6. **Strategic Map is the default** — Financial Projection is the alternate view; both live in the same results panel after a run.

---

## 12. Quick Reference

| Concept | Meaning |
|--------|--------|
| **Revenue Impact Card** | Dashboard/report entry: either “Configure & Run Simulation” or summary + “Open Simulation Workspace”. No engine run. |
| **Revenue Impact Workspace** | Full page at `/dashboard/[projectId]/revenue-impact`: configure, run once, see Strategic Map or Financial Projection. |
| **Business profile** | Project-level stored inputs (model, revenue, sensitivity, etc.) and last opportunity + confidence. |
| **Run simulation** | Single action that runs the impact engine and updates stored result and UI. |
| **Strategic Map** | Default result view: matrix (color only), opportunity concentration, industry alignment, strategic brief. |
| **Financial Projection** | Alternate result view: opportunity range, % uplift, confidence, timestamp. |

This is the intended behavior and boundaries for the Revenue Impact feature. Any change that would auto-run the engine from the card, change impact engine math, or remove the one-time explicit run should be treated as a deviation from this plan.
