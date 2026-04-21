export type IndustryKey = "ecommerce" | "fintech" | "saas" | "generic";

export type IndustryBenchmark = {
  LCP: number; // seconds
  INP: number; // ms
  TTFB: number; // ms
  CLS: number; // unitless
  TBT: number; // ms
  healthMedian: number; // 0-100
};

export const industryBenchmarks: Record<IndustryKey, IndustryBenchmark> = {
  ecommerce: {
    LCP: 2.8,
    INP: 220,
    TTFB: 900,
    CLS: 0.12,
    TBT: 250,
    healthMedian: 62,
  },
  fintech: {
    LCP: 2.5,
    INP: 200,
    TTFB: 850,
    CLS: 0.1,
    TBT: 220,
    healthMedian: 68,
  },
  saas: {
    LCP: 2.4,
    INP: 180,
    TTFB: 800,
    CLS: 0.1,
    TBT: 200,
    healthMedian: 72,
  },
  generic: {
    LCP: 3.0,
    INP: 250,
    TTFB: 1000,
    CLS: 0.15,
    TBT: 300,
    healthMedian: 60,
  },
};

