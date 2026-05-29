// Demo-params context — the (events/month, $/iter) knobs that drive
// the bootstrap-from-bench scaling on the /demo route.
//
// Persisted to localStorage so a buyer's selections survive a refresh.
// Only meaningful when AuthCtx.demo is true; ignored everywhere else.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_DEMO_PARAMS,
  MODEL_PRESETS,
  costPerIter,
  type DemoParams,
  type ModelId,
} from "./demo";

const EVENTS_KEY = "loopgain-demo-events-per-month";
const DOLLARS_KEY = "loopgain-demo-dollars-per-iter";
const MODEL_KEY = "loopgain-demo-model";

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function loadModel(): ModelId {
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    if (raw && MODEL_PRESETS.some((m) => m.id === raw)) return raw as ModelId;
  } catch {
    /* noop */
  }
  return "sonnet";
}

export interface DemoParamsCtx {
  params: DemoParams;
  model: ModelId;
  setEventsPerMonth: (n: number) => void;
  setDollarsPerIter: (n: number) => void;
  /** Picking a model preset also resets $/iter to that preset's
   *  default — the visitor can override after. */
  setModel: (id: ModelId) => void;
}

export const DemoParamsContext = createContext<DemoParamsCtx | null>(null);

export function useDemoParams(): DemoParamsCtx {
  const ctx = useContext(DemoParamsContext);
  if (!ctx) throw new Error("useDemoParams must be used inside <DemoParamsProvider>");
  return ctx;
}

export function useDemoParamsProvider(): DemoParamsCtx {
  const [eventsPerMonth, setEventsState] = useState<number>(() =>
    loadNumber(EVENTS_KEY, DEFAULT_DEMO_PARAMS.eventsPerMonth),
  );
  const [dollarsPerIter, setDollarsState] = useState<number>(() =>
    loadNumber(DOLLARS_KEY, DEFAULT_DEMO_PARAMS.dollarsPerIter),
  );
  const [model, setModelState] = useState<ModelId>(() => loadModel());

  useEffect(() => {
    localStorage.setItem(EVENTS_KEY, String(eventsPerMonth));
  }, [eventsPerMonth]);
  useEffect(() => {
    localStorage.setItem(DOLLARS_KEY, String(dollarsPerIter));
  }, [dollarsPerIter]);
  useEffect(() => {
    localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  const setEventsPerMonth = useCallback((n: number) => {
    if (Number.isFinite(n) && n > 0) setEventsState(n);
  }, []);
  const setDollarsPerIter = useCallback((n: number) => {
    if (Number.isFinite(n) && n > 0) setDollarsState(n);
  }, []);
  const setModel = useCallback((id: ModelId) => {
    const preset = MODEL_PRESETS.find((m) => m.id === id);
    if (!preset) return;
    setModelState(id);
    setDollarsState(costPerIter(preset));
  }, []);

  return useMemo(
    () => ({
      params: { eventsPerMonth, dollarsPerIter },
      model,
      setEventsPerMonth,
      setDollarsPerIter,
      setModel,
    }),
    [eventsPerMonth, dollarsPerIter, model, setEventsPerMonth, setDollarsPerIter, setModel],
  );
}
