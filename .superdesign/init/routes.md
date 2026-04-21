# Routes (Next.js App Router)

| URL | File | Layout |
|-----|------|--------|
| `/` | `app/page.tsx` | Root only — marketing / analyzer homepage (`home-premium`, 3D hero) |
| `/login` | `app/login/page.tsx` | Root |
| `/signup` | `app/auth/signup/page.tsx` | Root |
| `/auth/login` | `app/auth/login/page.tsx` | Root |
| `/dashboard` | `app/dashboard/page.tsx` | `app/dashboard/layout.tsx` |
| `/dashboard/[projectId]` | `app/dashboard/[projectId]/page.tsx` | Dashboard layout |
| `/dashboard/[projectId]/revenue-impact` | `app/dashboard/[projectId]/revenue-impact/page.tsx` | Dashboard layout |
| `/report` | `app/report/page.tsx` | Root — guest report |
| `/financial-report` | `app/financial-report/page.tsx` | Root |
| `/analyze` | `app/analyze/page.tsx` | Root |
| `/performance-history` | `app/performance-history/page.tsx` | Root |

**Home (`/`):** Performance / revenue positioning, URL analyze → `/api/analyze` → dashboard or `/report`; sections: hero + 3D preview, problem, solution flow, output tabs, priority table, analyzer CTA.
