"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboardNav } from "@/context/DashboardNavContext";

/**
 * Scroll-based navigation for the single-page dashboard. Each item
 * corresponds to a section id rendered on app/dashboard/[projectId]/page.tsx.
 *
 * The one route entry ("Revenue Impact") links to the /revenue-impact
 * workspace that pre-existed the dashboard and still lives on its own page.
 */

type ScrollNavItem = { kind: "scroll"; hash: string; label: string; sectionId: string };
type RouteNavItem = { kind: "route"; routeSegment: string; label: string; sectionId: string };
type NavItem = ScrollNavItem | RouteNavItem;

const NAV_ITEMS: NavItem[] = [
  { kind: "scroll", hash: "dashboard", label: "Dashboard", sectionId: "dashboard" },
  { kind: "scroll", hash: "revenue-exposure", label: "Revenue Exposure", sectionId: "revenue-exposure" },
  { kind: "scroll", hash: "impact-breakdown", label: "Impact Breakdown", sectionId: "impact-breakdown" },
  {
    kind: "scroll",
    hash: "metrics-responsible",
    label: "Metrics Dashboard",
    sectionId: "metrics-responsible",
  },
  { kind: "route", routeSegment: "revenue-impact", label: "Revenue Impact", sectionId: "revenue-impact" },
  {
    kind: "scroll",
    hash: "revenue-stability",
    label: "Performance History",
    sectionId: "revenue-stability",
  },
  {
    kind: "scroll",
    hash: "competitive-intelligence",
    label: "Competitive Position",
    sectionId: "competitive-intelligence",
  },
  {
    kind: "scroll",
    hash: "growth-impact-roadmap",
    label: "Growth Roadmap",
    sectionId: "growth-impact-roadmap",
  },
  {
    kind: "scroll",
    hash: "action-priority-list",
    label: "Priority Fixes",
    sectionId: "action-priority-list",
  },
];

const ITEM_BASE =
  "rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 border-l-2 border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]/45";

export default function DashboardSidebar() {
  const pathname = usePathname();
  const { activeSectionId } = useDashboardNav();

  const projectMatch = pathname?.match(/^\/dashboard\/([^/]+)(\/.*)?$/);
  const projectId = projectMatch?.[1];
  const restPath = projectMatch?.[2] ?? "";
  const onDashboardRoot = Boolean(projectId) && (restPath === "" || restPath === "/");
  const currentSegment = restPath.replace(/^\//, "");

  const handleScrollClick = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    if (!onDashboardRoot) return; // Let the link navigate back to dashboard.
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("pi-dashboard-expand-section", { detail: { id: hash } }));
    window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  return (
    <>
      <div className="mb-8">
        <Link
          href="/"
          className="rounded-sm text-base font-semibold tracking-tight text-white/95 opacity-100 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]/50"
        >
          Performance Intelligence
        </Link>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          if (item.kind === "scroll") {
            const href = onDashboardRoot
              ? `#${item.hash}`
              : projectId
                ? `/dashboard/${projectId}#${item.hash}`
                : `#${item.hash}`;
            const isActive = onDashboardRoot && activeSectionId === item.sectionId;
            return (
              <a
                key={item.sectionId}
                href={href}
                onClick={(e) => handleScrollClick(e, item.hash)}
                className={`${ITEM_BASE} ${
                  isActive ? "sidebar-item-active" : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-white/90"
                }`}
              >
                {item.label}
              </a>
            );
          }

          const href = projectId ? `/dashboard/${projectId}/${item.routeSegment}` : "#";
          const isActive = currentSegment === item.routeSegment;
          return (
            <Link
              key={item.sectionId}
              href={href}
              className={`${ITEM_BASE} ${
                isActive ? "sidebar-item-active" : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-white/90"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-auto border-t border-white/[0.06] pt-4 text-xs leading-snug text-[var(--muted)]">
        Profile (top right): your details, websites, log out.
      </p>
    </>
  );
}
