"use client";

import { useParams } from "next/navigation";
import RevenueImpactWorkspace from "@/components/RevenueImpactWorkspace";

export default function RevenueImpactPage() {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;

  if (!projectId) {
    return (
      <div className="p-8">
        <p className="text-sm text-[var(--muted)]">Project not found.</p>
      </div>
    );
  }

  return <RevenueImpactWorkspace projectId={projectId} />;
}
