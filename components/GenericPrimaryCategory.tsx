"use client";

import type { GenericCategory } from "@/lib/metricDrawerMonetization";

type GenericPrimaryCategoryProps = {
  category: GenericCategory;
  impactLevel: string;
  impactLevelClass: string;
  neutralDescription: string;
};

/** FREE tier only: generic category, impact badge, neutral description. No tactical copy. */
export default function GenericPrimaryCategory({
  category,
  impactLevel,
  impactLevelClass,
  neutralDescription,
}: GenericPrimaryCategoryProps) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase text-[var(--muted)]">
          Category: {category}
        </span>
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${impactLevelClass}`}>
          Impact Level: {impactLevel}
        </span>
      </div>
      <p className="text-xs text-[var(--muted)] leading-relaxed">{neutralDescription}</p>
    </div>
  );
}
