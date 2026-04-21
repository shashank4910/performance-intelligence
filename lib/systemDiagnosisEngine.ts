export type BottleneckDomain =
  | "Infrastructure"
  | "Frontend Rendering"
  | "JavaScript / Main Thread"
  | "Third-Party Dependencies";

export type SeverityLevel =
  | "Strong Primary Bottleneck"
  | "Moderate Bottleneck"
  | "Distributed Performance Issues";

export type SystemDiagnosisInput = {
  lcpMs?: number | null;
  inpMs?: number | null;
  ttfbMs?: number | null;
  tbtMs?: number | null;
  cls?: number | null;
  speedIndexMs?: number | null;
  fcpMs?: number | null;
  mainThreadWorkMs?: number | null;
  serverAuditScore?: number | null; // 0..1 from Lighthouse audit score
  thirdPartyJsRatio?: number | null; // 0..1
  externalBlockingMs?: number | null;
  externalDomainsCount?: number | null;
};

export type DomainScores = {
  infrastructureScore: number;
  frontendScore: number;
  javascriptScore: number;
  thirdPartyScore: number;
};

export type DiagnosisOutput = {
  primaryBottleneck: BottleneckDomain;
  domainScores: DomainScores;
  domainImpactPercentages: {
    infrastructure: number;
    frontend: number;
    javascript: number;
    thirdParty: number;
  };
  severityLevel: SeverityLevel;
  topContributingMetrics: Array<{ metric: string; contribution: number }>;
  debug: {
    severities: Record<string, number | null>;
    domainComponentScores: Record<string, number>;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize metric to severity 0..100.
 * severity = min(100, max(0, ((value - ideal) / (threshold - ideal)) * 100))
 */
export function normalizeSeverity(
  value: number | null | undefined,
  ideal: number,
  threshold: number
): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (threshold <= ideal) return null;
  const severity = ((value - ideal) / (threshold - ideal)) * 100;
  return clamp(severity, 0, 100);
}

function weightedScore(
  parts: Array<{ severity: number | null; weight: number; name: string }>
): { score: number; components: Record<string, number> } {
  const available = parts.filter((p) => p.severity != null);
  if (available.length === 0) {
    return { score: 0, components: {} };
  }
  const totalWeight = available.reduce((s, p) => s + p.weight, 0);
  if (totalWeight <= 0) return { score: 0, components: {} };

  const components: Record<string, number> = {};
  let sum = 0;
  for (const p of available) {
    const w = p.weight / totalWeight;
    const contribution = (p.severity as number) * w;
    components[p.name] = Number(contribution.toFixed(2));
    sum += contribution;
  }
  return { score: Number(sum.toFixed(2)), components };
}

export function computeSystemDiagnosis(input: SystemDiagnosisInput): DiagnosisOutput {
  // Requested normalization thresholds
  const lcpSeverity = normalizeSeverity(
    input.lcpMs != null ? input.lcpMs / 1000 : null,
    2.5,
    4.5
  );
  const inpSeverity = normalizeSeverity(input.inpMs, 200, 500);
  const ttfbSeverity = normalizeSeverity(input.ttfbMs, 800, 1800);
  const tbtSeverity = normalizeSeverity(input.tbtMs, 200, 600);
  const clsSeverity = normalizeSeverity(input.cls, 0.1, 0.25);
  const speedIndexSeverity = normalizeSeverity(
    input.speedIndexMs != null ? input.speedIndexMs / 1000 : null,
    3.4,
    6.0
  );
  const fcpSeverity = normalizeSeverity(
    input.fcpMs != null ? input.fcpMs / 1000 : null,
    1.8,
    3.0
  );
  const mainThreadSeverity = normalizeSeverity(input.mainThreadWorkMs, 2000, 6000);

  const lcpServerDelaySeverity = normalizeSeverity(input.ttfbMs, 800, 1800);
  const lcpRenderDelaySeverity =
    input.lcpMs != null && input.ttfbMs != null
      ? normalizeSeverity(Math.max(0, input.lcpMs - input.ttfbMs), 1200, 3200)
      : null;
  const serverAuditFlagsSeverity =
    input.serverAuditScore == null ? null : clamp((1 - input.serverAuditScore) * 100, 0, 100);

  const thirdPartyRatioSeverity =
    input.thirdPartyJsRatio == null
      ? null
      : normalizeSeverity(input.thirdPartyJsRatio, 0.2, 0.6);
  const externalBlockingSeverity = normalizeSeverity(input.externalBlockingMs, 80, 300);
  const externalDomainsSeverity = normalizeSeverity(input.externalDomainsCount, 5, 20);

  // Domain formulas (weights normalized when metrics are missing)
  const infra = weightedScore([
    { name: "ttfbSeverity", severity: ttfbSeverity, weight: 0.5 },
    { name: "lcpServerDelaySeverity", severity: lcpServerDelaySeverity, weight: 0.3 },
    { name: "serverAuditFlagsSeverity", severity: serverAuditFlagsSeverity, weight: 0.2 },
  ]);
  const frontend = weightedScore([
    { name: "lcpRenderDelaySeverity", severity: lcpRenderDelaySeverity, weight: 0.4 },
    { name: "fcpSeverity", severity: fcpSeverity, weight: 0.3 },
    { name: "clsSeverity", severity: clsSeverity, weight: 0.3 },
  ]);
  const javascript = weightedScore([
    { name: "inpSeverity", severity: inpSeverity, weight: 0.4 },
    { name: "tbtSeverity", severity: tbtSeverity, weight: 0.4 },
    { name: "mainThreadSeverity", severity: mainThreadSeverity, weight: 0.2 },
  ]);
  const thirdParty = weightedScore([
    { name: "thirdPartyRatioSeverity", severity: thirdPartyRatioSeverity, weight: 0.4 },
    { name: "externalBlockingSeverity", severity: externalBlockingSeverity, weight: 0.4 },
    { name: "externalDomainsSeverity", severity: externalDomainsSeverity, weight: 0.2 },
  ]);

  const domainScores: DomainScores = {
    infrastructureScore: infra.score,
    frontendScore: frontend.score,
    javascriptScore: javascript.score,
    thirdPartyScore: thirdParty.score,
  };

  const ordered: Array<{ domain: BottleneckDomain; score: number }> = (
    [
      { domain: "Infrastructure", score: domainScores.infrastructureScore },
      { domain: "Frontend Rendering", score: domainScores.frontendScore },
      { domain: "JavaScript / Main Thread", score: domainScores.javascriptScore },
      { domain: "Third-Party Dependencies", score: domainScores.thirdPartyScore },
    ] as Array<{ domain: BottleneckDomain; score: number }>
  ).sort((a, b) => b.score - a.score);

  const highest = ordered[0]?.score ?? 0;
  const second = ordered[1]?.score ?? 0;
  let severityLevel: SeverityLevel = "Distributed Performance Issues";
  if (highest > 65 && second < 55) severityLevel = "Strong Primary Bottleneck";
  else if (highest >= 45 && highest <= 65) severityLevel = "Moderate Bottleneck";
  else if (ordered.every((d) => d.score < 40)) severityLevel = "Distributed Performance Issues";

  const total =
    domainScores.infrastructureScore +
    domainScores.frontendScore +
    domainScores.javascriptScore +
    domainScores.thirdPartyScore;

  const domainImpactPercentages =
    total > 0
      ? {
          infrastructure: Math.round((domainScores.infrastructureScore / total) * 100),
          frontend: Math.round((domainScores.frontendScore / total) * 100),
          javascript: Math.round((domainScores.javascriptScore / total) * 100),
          thirdParty: Math.round((domainScores.thirdPartyScore / total) * 100),
        }
      : { infrastructure: 0, frontend: 0, javascript: 0, thirdParty: 0 };

  const contributors = [
    ...Object.entries(infra.components),
    ...Object.entries(frontend.components),
    ...Object.entries(javascript.components),
    ...Object.entries(thirdParty.components),
  ]
    .map(([metric, contribution]) => ({ metric, contribution }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2);

  const output: DiagnosisOutput = {
    primaryBottleneck: ordered[0]?.domain ?? "Infrastructure",
    domainScores,
    domainImpactPercentages,
    severityLevel,
    topContributingMetrics: contributors,
    debug: {
      severities: {
        lcpSeverity,
        inpSeverity,
        ttfbSeverity,
        tbtSeverity,
        clsSeverity,
        speedIndexSeverity,
        fcpSeverity,
        mainThreadSeverity,
        lcpServerDelaySeverity,
        lcpRenderDelaySeverity,
        serverAuditFlagsSeverity,
        thirdPartyRatioSeverity,
        externalBlockingSeverity,
        externalDomainsSeverity,
      },
      domainComponentScores: {
        ...infra.components,
        ...frontend.components,
        ...javascript.components,
        ...thirdParty.components,
      },
    },
  };

  return output;
}

