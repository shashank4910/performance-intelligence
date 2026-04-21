/**
 * PROJECT CONTEXT
 *
 * Before modifying this file, read:
 * /docs/AI_CONTEXT.md
 * /docs/ARCHITECTURE.md
 *
 * This project is a Performance Intelligence Engine that converts
 * performance metrics into business impact insights.
 */

/**
 * Business model registry for Revenue Intelligence.
 * Supports E-commerce, SaaS, Content/Ads, Lead Gen, and Portfolio/General.
 * Default industry estimates when user does not enter values.
 */

export type BusinessModelDefaults = {
  traffic: number;
  aov: number;
  baselineConv: number;
  name: string;
};

/** Model-specific inputs for baseline revenue (user or defaults). */
export type BusinessModelInputs = {
  /** All models: monthly unique visitors/traffic. */
  monthlyTraffic?: number;
  /** E-commerce: conversion rate (0–1). */
  conversionRate?: number;
  /** E-commerce: average order value ($). */
  averageOrderValue?: number;
  /** SaaS: trial signup rate (0–1). */
  trialConversionRate?: number;
  /** SaaS: trial→paid rate (0–1). */
  paidConversionRate?: number;
  /** SaaS: subscription value per paid user ($/mo). */
  subscriptionValue?: number;
  /** Content/Ads: pageviews per session. */
  pageviewsPerSession?: number;
  /** Content/Ads: revenue per 1000 pageviews ($). */
  rpm?: number;
  /** Lead Gen: visitor→lead rate (0–1). */
  leadConversionRate?: number;
  /** Lead Gen: value per lead ($). */
  leadValue?: number;
};

export const BUSINESS_MODELS: Record<string, BusinessModelDefaults> = {
  ECOMMERCE: {
    traffic: 100000,
    aov: 75,
    baselineConv: 0.025,
    name: "E-commerce",
  },
  SAAS: {
    traffic: 50000,
    aov: 50,
    baselineConv: 0.02,
    name: "SaaS",
  },
  CONTENT_ADS: {
    traffic: 200000,
    aov: 0,
    baselineConv: 0,
    name: "Content / Ads",
  },
  LEAD_GEN: {
    traffic: 30000,
    aov: 0,
    baselineConv: 0.01,
    name: "Lead Generation",
  },
  GENERAL: {
    traffic: 25000,
    aov: 20,
    baselineConv: 0.01,
    name: "Portfolio/General",
  },
};

/** Default model key when no project profile exists. */
export const DEFAULT_BUSINESS_MODEL_KEY = "GENERAL";

/** Default model-specific inputs (industry estimates) when user leaves fields empty. */
export const DEFAULT_MODEL_INPUTS: Record<string, BusinessModelInputs> = {
  ECOMMERCE: {
    monthlyTraffic: 100000,
    conversionRate: 0.025,
    averageOrderValue: 75,
  },
  SAAS: {
    monthlyTraffic: 50000,
    trialConversionRate: 0.05,
    paidConversionRate: 0.25,
    subscriptionValue: 50,
  },
  CONTENT_ADS: {
    monthlyTraffic: 200000,
    pageviewsPerSession: 2.5,
    rpm: 2,
  },
  LEAD_GEN: {
    monthlyTraffic: 30000,
    leadConversionRate: 0.02,
    leadValue: 25,
  },
  GENERAL: {
    monthlyTraffic: 25000,
    conversionRate: 0.01,
    averageOrderValue: 20,
  },
};

/**
 * Compute estimated monthly revenue from registry defaults (legacy).
 * Revenue = traffic * aov * baselineConv (monthly).
 */
export function getDefaultMonthlyRevenue(modelKey: string): number {
  const model = BUSINESS_MODELS[modelKey] ?? BUSINESS_MODELS[DEFAULT_BUSINESS_MODEL_KEY];
  return model.traffic * model.aov * model.baselineConv;
}

/**
 * Compute baseline monthly revenue from business model and inputs.
 * Uses default industry estimates for any missing input.
 */
export function computeBaselineRevenue(
  modelKey: string,
  inputs?: BusinessModelInputs | null
): number {
  const defaults = DEFAULT_MODEL_INPUTS[modelKey] ?? DEFAULT_MODEL_INPUTS[DEFAULT_BUSINESS_MODEL_KEY];
  const t = inputs ?? {};
  const key = modelKey in DEFAULT_MODEL_INPUTS ? modelKey : DEFAULT_BUSINESS_MODEL_KEY;
  const def = DEFAULT_MODEL_INPUTS[key] ?? DEFAULT_MODEL_INPUTS[DEFAULT_BUSINESS_MODEL_KEY];

  switch (key) {
    case "ECOMMERCE": {
      const monthlyTraffic = t.monthlyTraffic ?? def.monthlyTraffic ?? 100000;
      const conversionRate = t.conversionRate ?? def.conversionRate ?? 0.025;
      const averageOrderValue = t.averageOrderValue ?? def.averageOrderValue ?? 75;
      return monthlyTraffic * conversionRate * averageOrderValue;
    }
    case "SAAS": {
      const monthlyTraffic = t.monthlyTraffic ?? def.monthlyTraffic ?? 50000;
      const trialConversionRate = t.trialConversionRate ?? def.trialConversionRate ?? 0.05;
      const paidConversionRate = t.paidConversionRate ?? def.paidConversionRate ?? 0.25;
      const subscriptionValue = t.subscriptionValue ?? def.subscriptionValue ?? 50;
      return monthlyTraffic * trialConversionRate * paidConversionRate * subscriptionValue;
    }
    case "CONTENT_ADS": {
      const monthlyTraffic = t.monthlyTraffic ?? def.monthlyTraffic ?? 200000;
      const pageviewsPerSession = t.pageviewsPerSession ?? def.pageviewsPerSession ?? 2.5;
      const rpm = t.rpm ?? def.rpm ?? 2;
      return (monthlyTraffic * pageviewsPerSession / 1000) * rpm;
    }
    case "LEAD_GEN": {
      const monthlyTraffic = t.monthlyTraffic ?? def.monthlyTraffic ?? 30000;
      const leadConversionRate = t.leadConversionRate ?? def.leadConversionRate ?? 0.02;
      const leadValue = t.leadValue ?? def.leadValue ?? 25;
      return monthlyTraffic * leadConversionRate * leadValue;
    }
    default: {
      const monthlyTraffic = t.monthlyTraffic ?? def.monthlyTraffic ?? 25000;
      const conversionRate = t.conversionRate ?? def.conversionRate ?? 0.01;
      const averageOrderValue = t.averageOrderValue ?? def.averageOrderValue ?? 20;
      return monthlyTraffic * conversionRate * averageOrderValue;
    }
  }
}
