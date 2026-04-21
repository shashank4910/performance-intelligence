import type { FixBlueprintSteps } from "@/lib/metricDrawerMonetization";

type FixBlueprintProProps = {
  steps: FixBlueprintSteps;
};

export default function FixBlueprintPro({ steps }: FixBlueprintProProps) {
  if (!steps) return null;

  return (
    <div className="space-y-2">
      {Object.entries(steps).map(([key, value], idx) => (
        <div key={key} className="flex gap-2">
          <span className="text-[var(--accent)] font-bold text-xs">{idx + 1}.</span>
          <p className="text-[10px] text-[var(--foreground)]">{value}</p>
        </div>
      ))}
    </div>
  );
}
