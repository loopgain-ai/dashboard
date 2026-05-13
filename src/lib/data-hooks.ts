// Higher-level data hooks. Each returns the typed response in either
// "live" mode (real receiver) or "demo" mode (synthetic fleet).

import { useMemo } from "react";
import {
  getCalibration,
  getEvents,
  getProfiles,
  getStats,
  useApi,
  useAuth,
  type LoadState,
} from "./api";
import { demoCalibration, demoEvents, demoProfiles, demoStats } from "./demo";
import type {
  CalibrationResponse,
  EventsResponse,
  ProfilesResponse,
  StatsResponse,
} from "../types";

const NOW = () => Date.now();

export function useStats(opts: { pollMs?: number } = {}): {
  state: LoadState<StatsResponse>;
  refresh: () => void;
} {
  const { demo } = useAuth();
  const { state, refresh } = useApi<StatsResponse>(
    demo ? null : (c, signal) => getStats(c, signal),
    [],
    opts,
  );
  const demoState = useMemo<LoadState<StatsResponse>>(
    () => ({ status: "ok", data: demoStats(), loadedAt: NOW() }),
    [],
  );
  if (demo) return { state: demoState, refresh };
  return { state, refresh };
}

export function useProfiles(
  opts: { workloadId?: string; sinceHours?: number; pollMs?: number } = {},
): { state: LoadState<ProfilesResponse>; refresh: () => void } {
  const { demo } = useAuth();
  const { state, refresh } = useApi<ProfilesResponse>(
    demo
      ? null
      : (c, signal) =>
          getProfiles(c, { workloadId: opts.workloadId, sinceHours: opts.sinceHours }, signal),
    [opts.workloadId, opts.sinceHours],
    { pollMs: opts.pollMs },
  );
  const demoState = useMemo<LoadState<ProfilesResponse>>(
    () => ({
      status: "ok",
      data: demoProfiles({ workloadId: opts.workloadId, sinceHours: opts.sinceHours }),
      loadedAt: NOW(),
    }),
    [opts.workloadId, opts.sinceHours],
  );
  if (demo) return { state: demoState, refresh };
  return { state, refresh };
}

export function useEvents(
  opts: { rollbacksOnly?: boolean; sinceHours?: number; pollMs?: number } = {},
): { state: LoadState<EventsResponse>; refresh: () => void } {
  const { demo } = useAuth();
  const { state, refresh } = useApi<EventsResponse>(
    demo ? null : (c, signal) => getEvents(c, { rollbacksOnly: opts.rollbacksOnly }, signal),
    [opts.rollbacksOnly ?? false],
    { pollMs: opts.pollMs },
  );
  const demoState = useMemo<LoadState<EventsResponse>>(
    () => ({
      status: "ok",
      data: demoEvents({ rollbacksOnly: opts.rollbacksOnly }),
      loadedAt: NOW(),
    }),
    [opts.rollbacksOnly],
  );
  const base = demo ? demoState : state;
  // The receiver doesn't accept a `since_hours` param on /v1/events, so we
  // apply the time-range filter client-side using `timestamp_hour`.
  const filtered = useMemo<LoadState<EventsResponse>>(() => {
    if (opts.sinceHours == null) return base;
    const since = Math.floor(Date.now() / 1000) - opts.sinceHours * 3600;
    const apply = (d: EventsResponse): EventsResponse => ({
      ...d,
      events: d.events.filter((e) => e.timestamp_hour >= since),
    });
    if (base.status === "ok") return { ...base, data: apply(base.data) };
    if (base.status === "loading" && base.previous)
      return { ...base, previous: apply(base.previous) };
    if (base.status === "error" && base.previous)
      return { ...base, previous: apply(base.previous) };
    return base;
  }, [base, opts.sinceHours]);
  return { state: filtered, refresh };
}

export function useCalibration(
  opts: { workloadId?: string; sinceHours?: number; pollMs?: number } = {},
): { state: LoadState<CalibrationResponse>; refresh: () => void } {
  const { demo } = useAuth();
  const { state, refresh } = useApi<CalibrationResponse>(
    demo
      ? null
      : (c, signal) =>
          getCalibration(
            c,
            { workloadId: opts.workloadId, sinceHours: opts.sinceHours },
            signal,
          ),
    [opts.workloadId, opts.sinceHours],
    { pollMs: opts.pollMs },
  );
  const demoState = useMemo<LoadState<CalibrationResponse>>(
    () => ({
      status: "ok",
      data: demoCalibration({ workloadId: opts.workloadId, sinceHours: opts.sinceHours }),
      loadedAt: NOW(),
    }),
    [opts.workloadId, opts.sinceHours],
  );
  if (demo) return { state: demoState, refresh };
  return { state, refresh };
}

export type { LoadState } from "./api";
