"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  BUSINESS_MODELS,
  DEFAULT_BUSINESS_MODEL_KEY,
  DEFAULT_MODEL_INPUTS,
  computeBaselineRevenue,
  type BusinessModelInputs,
} from "@/lib/impactEngine/businessModelRegistry";

const MODEL_KEYS = ["ECOMMERCE", "SAAS", "CONTENT_ADS", "LEAD_GEN", "GENERAL"] as const;
type BusinessModelKey = (typeof MODEL_KEYS)[number];

export type RefineRevenueFormValues = {
  businessModelId: string;
  monthlyRevenue: string;
  traffic: string;
  conversionRate?: string;
  averageOrderValue?: string;
  trialConversionRate?: string;
  paidConversionRate?: string;
  subscriptionValue?: string;
  pageviewsPerSession?: string;
  rpm?: string;
  leadConversionRate?: string;
  leadValue?: string;
};

type RefineRevenueModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | undefined;
  /** Initial values when opening (e.g. from existing profile). */
  initialValues?: Partial<RefineRevenueFormValues> | null;
  /** Called after successful save with the saved profile so parent can recompute leak. */
  onSaved?: (profile: { monthlyRevenue: number; businessModelId?: string; advancedInputs?: Record<string, unknown> }) => void;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function parseNum(s: string): number {
  return Number(s.replace(/[^0-9.]/g, "")) || 0;
}

/** Dropdown list rendered in a portal so it is never clipped by the modal. */
const BusinessModelDropdownList = React.forwardRef<
  HTMLDivElement,
  {
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    selectedKey: string;
    onSelect: (key: string) => void;
  }
>(function BusinessModelDropdownList({ triggerRef, selectedKey, onSelect }, ref) {
  const [style, setStyle] = useState({ top: 0, left: 0, minWidth: 200 });
  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setStyle({
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: Math.max(rect.width, 200),
    });
  }, [triggerRef]);
  return (
    <div
      ref={ref}
      role="listbox"
      className="fixed z-[100] max-h-[280px] overflow-y-auto rounded-lg border border-white/10 bg-[var(--card)] py-1 shadow-xl"
      style={{
        top: style.top,
        left: style.left,
        minWidth: style.minWidth,
      }}
    >
      {MODEL_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="option"
          aria-selected={selectedKey === key}
          onClick={() => onSelect(key)}
          className={`w-full px-3 py-2 text-left text-sm ${
            selectedKey === key
              ? "bg-[#befe34]/20 text-[var(--accent)]"
              : "text-[var(--foreground)] hover:bg-white/10"
          }`}
        >
          {BUSINESS_MODELS[key].name}
        </button>
      ))}
    </div>
  );
});

export default function RefineRevenueModal({
  open,
  onOpenChange,
  projectId,
  initialValues,
  onSaved,
}: RefineRevenueModalProps) {
  const [businessModelId, setBusinessModelId] = useState<string>(
    initialValues?.businessModelId ?? DEFAULT_BUSINESS_MODEL_KEY
  );
  const [traffic, setTraffic] = useState(initialValues?.traffic ?? "");
  const [conversionRate, setConversionRate] = useState(initialValues?.conversionRate ?? "");
  const [averageOrderValue, setAverageOrderValue] = useState(initialValues?.averageOrderValue ?? "");
  const [trialConversionRate, setTrialConversionRate] = useState(initialValues?.trialConversionRate ?? "");
  const [paidConversionRate, setPaidConversionRate] = useState(initialValues?.paidConversionRate ?? "");
  const [subscriptionValue, setSubscriptionValue] = useState(initialValues?.subscriptionValue ?? "");
  const [pageviewsPerSession, setPageviewsPerSession] = useState(initialValues?.pageviewsPerSession ?? "");
  const [rpm, setRpm] = useState(initialValues?.rpm ?? "");
  const [leadConversionRate, setLeadConversionRate] = useState(initialValues?.leadConversionRate ?? "");
  const [leadValue, setLeadValue] = useState(initialValues?.leadValue ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businessModelOpen, setBusinessModelOpen] = useState(false);
  const businessModelTriggerRef = useRef<HTMLButtonElement>(null);
  const businessModelListRef = useRef<HTMLDivElement>(null);

  // Close business model dropdown on outside click
  useEffect(() => {
    if (!businessModelOpen) return;
    const handleClick = (e: MouseEvent) => {
      const trigger = businessModelTriggerRef.current;
      const list = businessModelListRef.current;
      if (
        trigger?.contains(e.target as Node) ||
        list?.contains(e.target as Node)
      )
        return;
      setBusinessModelOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [businessModelOpen]);

  const model = BUSINESS_MODELS[businessModelId] ?? BUSINESS_MODELS[DEFAULT_BUSINESS_MODEL_KEY];
  const defaults = DEFAULT_MODEL_INPUTS[businessModelId] ?? DEFAULT_MODEL_INPUTS[DEFAULT_BUSINESS_MODEL_KEY];

  const formInputs: BusinessModelInputs = {
    monthlyTraffic: traffic ? parseNum(traffic) : undefined,
    conversionRate: conversionRate ? parseNum(conversionRate) / 100 : undefined,
    averageOrderValue: averageOrderValue ? parseNum(averageOrderValue) : undefined,
    trialConversionRate: trialConversionRate ? parseNum(trialConversionRate) / 100 : undefined,
    paidConversionRate: paidConversionRate ? parseNum(paidConversionRate) / 100 : undefined,
    subscriptionValue: subscriptionValue ? parseNum(subscriptionValue) : undefined,
    pageviewsPerSession: pageviewsPerSession ? parseNum(pageviewsPerSession) : undefined,
    rpm: rpm ? parseNum(rpm) : undefined,
    leadConversionRate: leadConversionRate ? parseNum(leadConversionRate) / 100 : undefined,
    leadValue: leadValue ? parseNum(leadValue) : undefined,
  };
  const suggestedRevenue = computeBaselineRevenue(businessModelId, formInputs);

  const resetForm = useCallback(() => {
    setBusinessModelId(initialValues?.businessModelId ?? DEFAULT_BUSINESS_MODEL_KEY);
    setTraffic(initialValues?.traffic ?? "");
    setConversionRate(initialValues?.conversionRate ?? "");
    setAverageOrderValue(initialValues?.averageOrderValue ?? "");
    setTrialConversionRate(initialValues?.trialConversionRate ?? "");
    setPaidConversionRate(initialValues?.paidConversionRate ?? "");
    setSubscriptionValue(initialValues?.subscriptionValue ?? "");
    setPageviewsPerSession(initialValues?.pageviewsPerSession ?? "");
    setRpm(initialValues?.rpm ?? "");
    setLeadConversionRate(initialValues?.leadConversionRate ?? "");
    setLeadValue(initialValues?.leadValue ?? "");
    setError(null);
  }, [initialValues]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm]
  );

  const buildAdvancedInputs = useCallback((): Record<string, unknown> => {
    const trafficNum = traffic ? parseNum(traffic) : undefined;
    const base =
      typeof trafficNum === "number" && Number.isFinite(trafficNum) ? { monthlyTraffic: trafficNum } : {};
    const key = MODEL_KEYS.includes(businessModelId as BusinessModelKey) ? businessModelId : DEFAULT_BUSINESS_MODEL_KEY;
    switch (key) {
      case "ECOMMERCE":
        return {
          ...base,
          conversionRate: conversionRate ? parseNum(conversionRate) / 100 : (defaults.conversionRate ?? 0.025),
          averageOrderValue: averageOrderValue ? parseNum(averageOrderValue) : (defaults.averageOrderValue ?? 75),
        };
      case "SAAS":
        return {
          ...base,
          trialConversionRate: trialConversionRate ? parseNum(trialConversionRate) / 100 : (defaults.trialConversionRate ?? 0.05),
          paidConversionRate: paidConversionRate ? parseNum(paidConversionRate) / 100 : (defaults.paidConversionRate ?? 0.25),
          subscriptionValue: subscriptionValue ? parseNum(subscriptionValue) : (defaults.subscriptionValue ?? 50),
        };
      case "CONTENT_ADS":
        return {
          ...base,
          pageviewsPerSession: pageviewsPerSession ? parseNum(pageviewsPerSession) : (defaults.pageviewsPerSession ?? 2.5),
          rpm: rpm ? parseNum(rpm) : (defaults.rpm ?? 2),
        };
      case "LEAD_GEN":
        return {
          ...base,
          leadConversionRate: leadConversionRate ? parseNum(leadConversionRate) / 100 : (defaults.leadConversionRate ?? 0.02),
          leadValue: leadValue ? parseNum(leadValue) : (defaults.leadValue ?? 25),
        };
      default:
        return {
          ...base,
          conversionRate: conversionRate ? parseNum(conversionRate) / 100 : (defaults.conversionRate ?? 0.01),
          averageOrderValue: averageOrderValue ? parseNum(averageOrderValue) : (defaults.averageOrderValue ?? 20),
        };
    }
  }, [
    businessModelId,
    traffic,
    conversionRate,
    averageOrderValue,
    trialConversionRate,
    paidConversionRate,
    subscriptionValue,
    pageviewsPerSession,
    rpm,
    leadConversionRate,
    leadValue,
    defaults,
  ]);

  const handleSave = useCallback(async () => {
    if (!projectId) {
      setError("Project not found. Save your analysis first.");
      return;
    }
    setError(null);
    setSaving(true);
    const advancedInputs = buildAdvancedInputs();
    const revenueToSave = Math.round(suggestedRevenue);
    try {
      const res = await fetch("/api/project-business-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          businessModelId: businessModelId as BusinessModelKey,
          monthlyRevenue: revenueToSave,
          advancedInputs,
          sensitivityMode: "balanced",
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        profile?: { monthlyRevenue: number; businessModelId?: string; advancedInputs?: Record<string, unknown> };
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      if (data.profile) {
        onSaved?.({
          monthlyRevenue: data.profile.monthlyRevenue,
          businessModelId: data.profile.businessModelId,
          advancedInputs: data.profile.advancedInputs,
        });
      } else {
        onSaved?.({ monthlyRevenue: revenueToSave, businessModelId, advancedInputs });
      }
      handleOpenChange(false);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }, [projectId, businessModelId, suggestedRevenue, buildAdvancedInputs, onSaved, handleOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-visible p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refine-revenue-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => handleOpenChange(false)}
      />
      <div className="relative w-full max-w-md overflow-visible ui-panel p-6 shadow-xl">
        <h2 id="refine-revenue-title" className="text-lg font-semibold text-[var(--foreground)]">
          Refine revenue analysis
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Set your business model and inputs for a more accurate estimated leak.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label id="refine-business-model-label" className="block text-sm font-medium text-[var(--foreground)]">
              Business model
            </label>
            <div className="mt-1 relative">
              <button
                ref={businessModelTriggerRef}
                type="button"
                id="refine-business-model"
                aria-haspopup="listbox"
                aria-expanded={businessModelOpen}
                aria-labelledby="refine-business-model-label"
                onClick={() => setBusinessModelOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-left text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              >
                <span>{BUSINESS_MODELS[businessModelId]?.name ?? businessModelId}</span>
                <svg className="h-4 w-4 shrink-0 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={businessModelOpen ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                </svg>
              </button>
              {businessModelOpen &&
                typeof document !== "undefined" &&
                createPortal(
                  <BusinessModelDropdownList
                    ref={businessModelListRef}
                    triggerRef={businessModelTriggerRef}
                    selectedKey={businessModelId}
                    onSelect={(key) => {
                      setBusinessModelId(key);
                      setBusinessModelOpen(false);
                    }}
                  />,
                  document.body
                )}
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Estimated baseline: ~${formatNumber(suggestedRevenue)}/mo (use defaults if fields left empty)
            </p>
          </div>

          <div>
            <label htmlFor="refine-traffic" className="block text-sm font-medium text-[var(--foreground)]">
              Monthly traffic (optional)
            </label>
            <input
              id="refine-traffic"
              type="text"
              inputMode="numeric"
              placeholder={`e.g. ${formatNumber(defaults.monthlyTraffic ?? model.traffic)}`}
              value={traffic}
              onChange={(e) => setTraffic(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          {/* Model-specific inputs (optional); defaults used when empty */}
          {businessModelId === "ECOMMERCE" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="refine-conversion-rate" className="block text-sm font-medium text-[var(--foreground)]">Conversion rate % (optional)</label>
                <input id="refine-conversion-rate" type="text" inputMode="decimal" placeholder={`${((defaults.conversionRate ?? 0.025) * 100).toFixed(2)}`} value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
              <div>
                <label htmlFor="refine-aov" className="block text-sm font-medium text-[var(--foreground)]">AOV $ (optional)</label>
                <input id="refine-aov" type="text" inputMode="numeric" placeholder={String(defaults.averageOrderValue ?? 75)} value={averageOrderValue} onChange={(e) => setAverageOrderValue(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
            </div>
          )}
          {businessModelId === "SAAS" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="refine-trial-conv" className="block text-sm font-medium text-[var(--foreground)]">Trial conversion % (optional)</label>
                <input id="refine-trial-conv" type="text" inputMode="decimal" placeholder={`${((defaults.trialConversionRate ?? 0.05) * 100).toFixed(2)}`} value={trialConversionRate} onChange={(e) => setTrialConversionRate(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
              <div>
                <label htmlFor="refine-paid-conv" className="block text-sm font-medium text-[var(--foreground)]">Paid conversion % (optional)</label>
                <input id="refine-paid-conv" type="text" inputMode="decimal" placeholder={`${((defaults.paidConversionRate ?? 0.25) * 100).toFixed(2)}`} value={paidConversionRate} onChange={(e) => setPaidConversionRate(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
              <div className="col-span-2">
                <label htmlFor="refine-subscription-value" className="block text-sm font-medium text-[var(--foreground)]">Subscription value $/mo (optional)</label>
                <input id="refine-subscription-value" type="text" inputMode="numeric" placeholder={String(defaults.subscriptionValue ?? 50)} value={subscriptionValue} onChange={(e) => setSubscriptionValue(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
            </div>
          )}
          {businessModelId === "CONTENT_ADS" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="refine-pv-session" className="block text-sm font-medium text-[var(--foreground)]">Pageviews/session (optional)</label>
                <input id="refine-pv-session" type="text" inputMode="decimal" placeholder={String(defaults.pageviewsPerSession ?? 2.5)} value={pageviewsPerSession} onChange={(e) => setPageviewsPerSession(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
              <div>
                <label htmlFor="refine-rpm" className="block text-sm font-medium text-[var(--foreground)]">RPM $ (optional)</label>
                <input id="refine-rpm" type="text" inputMode="numeric" placeholder={String(defaults.rpm ?? 2)} value={rpm} onChange={(e) => setRpm(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
            </div>
          )}
          {businessModelId === "LEAD_GEN" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="refine-lead-conv" className="block text-sm font-medium text-[var(--foreground)]">Lead conversion % (optional)</label>
                <input id="refine-lead-conv" type="text" inputMode="decimal" placeholder={`${((defaults.leadConversionRate ?? 0.02) * 100).toFixed(2)}`} value={leadConversionRate} onChange={(e) => setLeadConversionRate(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
              <div>
                <label htmlFor="refine-lead-value" className="block text-sm font-medium text-[var(--foreground)]">Lead value $ (optional)</label>
                <input id="refine-lead-value" type="text" inputMode="numeric" placeholder={String(defaults.leadValue ?? 25)} value={leadValue} onChange={(e) => setLeadValue(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
            </div>
          )}
          {businessModelId === "GENERAL" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="refine-gen-conv" className="block text-sm font-medium text-[var(--foreground)]">Conversion % (optional)</label>
                <input id="refine-gen-conv" type="text" inputMode="decimal" placeholder={`${((defaults.conversionRate ?? 0.01) * 100).toFixed(2)}`} value={conversionRate} onChange={(e) => setConversionRate(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
              <div>
                <label htmlFor="refine-gen-aov" className="block text-sm font-medium text-[var(--foreground)]">AOV $ (optional)</label>
                <input id="refine-gen-aov" type="text" inputMode="numeric" placeholder={String(defaults.averageOrderValue ?? 20)} value={averageOrderValue} onChange={(e) => setAverageOrderValue(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]" />
              </div>
            </div>
          )}

          <p className="text-sm text-[var(--muted)]">
            Estimated baseline revenue: <span className="font-medium text-[var(--foreground)]">${formatNumber(suggestedRevenue)}/mo</span> (from traffic and conversion inputs above; use defaults if left empty).
          </p>

          {error && (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg apm-btn-primary px-4 py-2 text-sm font-medium  hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
