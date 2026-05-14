// Higher-level data hooks. Each returns the typed response in either
// "live" mode (real receiver) or "demo" mode (synthetic fleet).

import { useMemo } from "react";
import {
  getAlertDeliveries,
  getAlertRules,
  getCalibration,
  getEventDetail,
  getEvents,
  getProfiles,
  getStats,
  useApi,
  useAuth,
  type LoadState,
} from "./api";
import { useFilters } from "./filters";
import {
  demoAlertDeliveries,
  demoAlertRules,
  demoCalibration,
  demoEventDetail,
  demoEvents,
  demoProfiles,
  demoStats,
} from "./demo";
import type {
  AlertDeliveriesResponse,
  AlertRulesResponse,
  CalibrationResponse,
  EventDetailResponse,
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
  const { filters } = useFilters();
  // workloadId from props overrides the global filter (used by Loop Detail
  // to pin to a single workload regardless of the filter bar).
  const effectiveWorkload = opts.workloadId ?? filters.workload_id;
  const { state, refresh } = useApi<ProfilesResponse>(
    demo
      ? null
      : (c, signal) =>
          getProfiles(
            c,
            {
              workloadId: effectiveWorkload,
              sinceHours: opts.sinceHours,
              framework: filters.framework,
              loop_type: filters.loop_type,
              team: filters.team,
            },
            signal,
          ),
    [
      effectiveWorkload,
      opts.sinceHours,
      filters.framework,
      filters.loop_type,
      filters.team,
    ],
    { pollMs: opts.pollMs },
  );
  const demoState = useMemo<LoadState<ProfilesResponse>>(
    () => ({
      status: "ok",
      data: demoProfiles({
        workloadId: effectiveWorkload,
        sinceHours: opts.sinceHours,
        framework: filters.framework,
        loop_type: filters.loop_type,
        team: filters.team,
      }),
      loadedAt: NOW(),
    }),
    [
      effectiveWorkload,
      opts.sinceHours,
      filters.framework,
      filters.loop_type,
      filters.team,
    ],
  );
  if (demo) return { state: demoState, refresh };
  return { state, refresh };
}

export function useEvents(
  opts: { rollbacksOnly?: boolean; sinceHours?: number; pollMs?: number } = {},
): { state: LoadState<EventsResponse>; refresh: () => void } {
  const { demo } = useAuth();
  const { filters } = useFilters();
  const { state, refresh } = useApi<EventsResponse>(
    demo
      ? null
      : (c, signal) =>
          getEvents(
            c,
            {
              rollbacksOnly: opts.rollbacksOnly,
              framework: filters.framework,
              loop_type: filters.loop_type,
              team: filters.team,
              workload_id: filters.workload_id,
            },
            signal,
          ),
    [
      opts.rollbacksOnly ?? false,
      filters.framework,
      filters.loop_type,
      filters.team,
      filters.workload_id,
    ],
    { pollMs: opts.pollMs },
  );
  const demoState = useMemo<LoadState<EventsResponse>>(
    () => ({
      status: "ok",
      data: demoEvents({
        rollbacksOnly: opts.rollbacksOnly,
        framework: filters.framework,
        loop_type: filters.loop_type,
        team: filters.team,
        workload_id: filters.workload_id,
      }),
      loadedAt: NOW(),
    }),
    [
      opts.rollbacksOnly,
      filters.framework,
      filters.loop_type,
      filters.team,
      filters.workload_id,
    ],
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
  const { filters } = useFilters();
  const effectiveWorkload = opts.workloadId ?? filters.workload_id;
  const { state, refresh } = useApi<CalibrationResponse>(
    demo
      ? null
      : (c, signal) =>
          getCalibration(
            c,
            {
              workloadId: effectiveWorkload,
              sinceHours: opts.sinceHours,
              framework: filters.framework,
              loop_type: filters.loop_type,
              team: filters.team,
            },
            signal,
          ),
    [
      effectiveWorkload,
      opts.sinceHours,
      filters.framework,
      filters.loop_type,
      filters.team,
    ],
  );
  const demoState = useMemo<LoadState<CalibrationResponse>>(
    () => ({
      status: "ok",
      data: demoCalibration({
        workloadId: effectiveWorkload,
        sinceHours: opts.sinceHours,
        framework: filters.framework,
        loop_type: filters.loop_type,
        team: filters.team,
      }),
      loadedAt: NOW(),
    }),
    [
      effectiveWorkload,
      opts.sinceHours,
      filters.framework,
      filters.loop_type,
      filters.team,
    ],
  );
  if (demo) return { state: demoState, refresh };
  return { state, refresh };
}

export function useAlertRules(
  opts: { pollMs?: number; refreshTrigger?: number } = {},
): { state: LoadState<AlertRulesResponse>; refresh: () => void } {
  const { demo } = useAuth();
  const { state, refresh } = useApi<AlertRulesResponse>(
    demo ? null : (c, signal) => getAlertRules(c, signal),
    [],
    opts,
  );
  const demoState = useMemo<LoadState<AlertRulesResponse>>(
    () => ({ status: "ok", data: { rules: demoAlertRules() }, loadedAt: NOW() }),
    [],
  );
  if (demo) return { state: demoState, refresh };
  return { state, refresh };
}

export function useAlertDeliveries(
  opts: { pollMs?: number; refreshTrigger?: number } = {},
): { state: LoadState<AlertDeliveriesResponse>; refresh: () => void } {
  const { demo } = useAuth();
  const { state, refresh } = useApi<AlertDeliveriesResponse>(
    demo ? null : (c, signal) => getAlertDeliveries(c, signal),
    [],
    opts,
  );
  const demoState = useMemo<LoadState<AlertDeliveriesResponse>>(
    () => ({
      status: "ok",
      data: { deliveries: demoAlertDeliveries() },
      loadedAt: NOW(),
    }),
    [],
  );
  if (demo) return { state: demoState, refresh };
  return { state, refresh };
}

export function useEventDetail(
  id: number | null,
): { state: LoadState<EventDetailResponse>; refresh: () => void } {
  const { demo } = useAuth();
  const { state, refresh } = useApi<EventDetailResponse>(
    !demo && id !== null ? (c, signal) => getEventDetail(c, id, signal) : null,
    [id],
  );
  const demoState = useMemo<LoadState<EventDetailResponse>>(() => {
    if (id === null) return { status: "idle" };
    return {
      status: "ok",
      data: { event: demoEventDetail(id) },
      loadedAt: NOW(),
    };
  }, [id]);
  if (demo) return { state: demoState, refresh };
  return { state, refresh };
}

export type { LoadState } from "./api";
