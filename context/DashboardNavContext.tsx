"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type DashboardNavContextValue = {
  activeSectionId: string | null;
  setActiveSectionId: (id: string | null) => void;
};

const DashboardNavContext = createContext<DashboardNavContextValue | null>(null);

export function DashboardNavProvider({ children }: { children: ReactNode }) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>("dashboard");
  return (
    <DashboardNavContext.Provider value={{ activeSectionId, setActiveSectionId }}>
      {children}
    </DashboardNavContext.Provider>
  );
}

export function useDashboardNav() {
  const ctx = useContext(DashboardNavContext);
  if (!ctx) return { activeSectionId: null, setActiveSectionId: () => {} };
  return ctx;
}
