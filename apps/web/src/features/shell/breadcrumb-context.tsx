"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type LabelMap = Record<string, string>;

interface BreadcrumbLabelContextValue {
  labels: LabelMap;
  setLabel: (segment: string, label: string) => void;
  clearLabel: (segment: string) => void;
}

const BreadcrumbLabelContext = createContext<BreadcrumbLabelContextValue | null>(null);

export function BreadcrumbLabelProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<LabelMap>({});

  // Stable across renders (functional updater form, no closed-over
  // `labels`) — required so useBreadcrumbLabel's effect below only
  // re-runs when `segment`/`label` actually change, not on every render.
  const setLabel = useCallback((segment: string, label: string) => {
    setLabels((prev) => (prev[segment] === label ? prev : { ...prev, [segment]: label }));
  }, []);

  const clearLabel = useCallback((segment: string) => {
    setLabels((prev) => {
      if (!(segment in prev)) return prev;
      const next = { ...prev };
      delete next[segment];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ labels, setLabel, clearLabel }),
    [labels, setLabel, clearLabel]
  );

  return (
    <BreadcrumbLabelContext.Provider value={value}>{children}</BreadcrumbLabelContext.Provider>
  );
}

export function useBreadcrumbLabels(): LabelMap {
  return useContext(BreadcrumbLabelContext)?.labels ?? {};
}

/**
 * Feeds AutoBreadcrumb a dynamic route segment's real display name once a
 * page has fetched it, instead of leaving the breadcrumb to fall back to
 * the raw route param (a database id).
 */
export function useBreadcrumbLabel(segment: string | undefined, label: string | undefined) {
  const ctx = useContext(BreadcrumbLabelContext);
  const setLabel = ctx?.setLabel;
  const clearLabel = ctx?.clearLabel;
  useEffect(() => {
    if (!setLabel || !clearLabel || !segment || !label) return;
    setLabel(segment, label);
    return () => clearLabel(segment);
  }, [setLabel, clearLabel, segment, label]);
}
