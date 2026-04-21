"use client";

import { UserAccountMenu } from "@/components/UserAccountMenu";

/** Sticky account entry above dashboard pages (sidebar stays primary nav). */
export function DashboardTopBar() {
  return (
    <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-end gap-3 border-b border-white/[0.06] bg-[#060a14]/90 px-4 backdrop-blur-md sm:px-6">
      <UserAccountMenu variant="dashboard" />
    </div>
  );
}
