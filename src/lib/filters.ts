// Dashboard-wide classification filters (schema v3).
//
// Lightweight context that holds the active framework/loop_type/team
// selection. Each panel that supports filtering reads the active set from
// here and passes it into its useApi loader; the receiver applies the
// filters server-side in the WHERE clause.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { FilterSet } from "../types";

export interface FilterCtx {
  filters: FilterSet;
  setFilter: (k: keyof FilterSet, v: string | undefined) => void;
  clear: () => void;
  /** True when at least one filter is active. */
  active: boolean;
}

export const FilterContext = createContext<FilterCtx | null>(null);

export function useFilters(): FilterCtx {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used inside <FilterProvider>");
  return ctx;
}

export function useFiltersProvider(): FilterCtx {
  const [filters, setFilters] = useState<FilterSet>({});

  const setFilter = useCallback((k: keyof FilterSet, v: string | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (v === undefined || v === "") delete next[k];
      else next[k] = v;
      return next;
    });
  }, []);

  const clear = useCallback(() => setFilters({}), []);

  const active = useMemo(
    () => Object.values(filters).some((v) => v !== undefined && v !== ""),
    [filters],
  );

  return useMemo(
    () => ({ filters, setFilter, clear, active }),
    [filters, setFilter, clear, active],
  );
}
