// Higher-level data hooks. Each returns the typed response in one of
// three modes:
//   - live  → real receiver via authed `/v1/*` endpoints
//   - bench → public `/v1/public/benchmark/*` endpoints, scoped on the
//             receiver side to the hardcoded canonical bench tenant.
//   - demo  → public bench fetch followed by a client-side scaling
//             transform driven by DemoParamsCtx (eventsPerMonth +
//             dollarsPerIter). See src/lib/demo.ts for the transforms.
// Both bench-mode and demo-mode use the `benchLoader` path in useApi;
// only the transform differs.

import { useMemo } from "react";
import {
  getAlertDeliveries,
  getAlertDeliveriesBench,
  getAlertRules,
  getAlertRulesBench,
  getEventDetail,
  getEventDetailBench,
  getEvents,
  getEventsBench,
  getProfiles,
  getProfilesBench,
  getStats,
  getStatsBench,
  useApi,
  useAuth,
  type LoadState,
} from "./api";
import { useFilters } from "./filters";
import { useDemoParams } from "./demo-params";
import {
  scaleEvents,
  scaleProfiles,
  scaleStats,
} from "./demo";
import type {
  AlertDeliveriesResponse,
  AlertRulesResponse,
  EventDetailResponse,
  EventsResponse,
  ProfilesResponse,
  StatsResponse,
} from "../types";

export function useStats(opts: { pollMs?: number } = {}): {
  state: LoadState<StatsResponse>;
  refresh: () => void;
} {
  const { demo, bench } = useAuth();
  const { params } = useDemoParams();
  return useApi<StatsResponse>(
    demo || bench ? null : (c, signal) => getStats(c, signal),
    [demo ? params.eventsPerMonth : 0, demo ? params.dollarsPerIter : 0],
    {
      ...opts,
      benchLoader: bench
        ? (signal) => getStatsBench(signal)
        : demo
        ? async (signal) => scaleStats(await getStatsBench(signal), params)
        : undefined,
    },
  );
}

export function useProfiles(
  opts: { workloadId?: string; sinceHours?: number; pollMs?: number } = {},
): { state: LoadState<ProfilesResponse>; refresh: () => void } {
  const { demo, bench } = useAuth();
  const { params } = useDemoParams();
  const { filters } = useFilters();
  // workloadId from props overrides the global filter (used by Loop Detail
  // to pin to a single workload regardless of the filter bar).
  const effectiveWorkload = opts.workloadId ?? filters.workload_id;
  return useApi<ProfilesResponse>(
    demo || bench
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
      demo ? params.eventsPerMonth : 0,
      demo ? params.dollarsPerIter : 0,
    ],
    {
      pollMs: opts.pollMs,
      benchLoader: bench
        ? (signal) =>
            getProfilesBench(
              {
                workloadId: effectiveWorkload,
                sinceHours: opts.sinceHours,
                framework: filters.framework,
                loop_type: filters.loop_type,
                team: filters.team,
              },
              signal,
            )
        : demo
        ? async (signal) =>
            scaleProfiles(
              await getProfilesBench(
                {
                  workloadId: effectiveWorkload,
                  sinceHours: opts.sinceHours,
                  framework: filters.framework,
                  loop_type: filters.loop_type,
                  team: filters.team,
                },
                signal,
              ),
              params,
            )
        : undefined,
    },
  );
}

export function useEvents(
  opts: { rollbacksOnly?: boolean; sinceHours?: number; pollMs?: number } = {},
): { state: LoadState<EventsResponse>; refresh: () => void } {
  const { demo, bench } = useAuth();
  const { params } = useDemoParams();
  const { filters } = useFilters();
  const { state, refresh } = useApi<EventsResponse>(
    demo || bench
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
      demo ? params.eventsPerMonth : 0,
      demo ? params.dollarsPerIter : 0,
    ],
    {
      pollMs: opts.pollMs,
      benchLoader: bench
        ? (signal) =>
            getEventsBench(
              {
                rollbacksOnly: opts.rollbacksOnly,
                framework: filters.framework,
                loop_type: filters.loop_type,
                team: filters.team,
                workload_id: filters.workload_id,
              },
              signal,
            )
        : demo
        ? async (signal) =>
            scaleEvents(
              await getEventsBench(
                {
                  rollbacksOnly: opts.rollbacksOnly,
                  framework: filters.framework,
                  loop_type: filters.loop_type,
                  team: filters.team,
                  workload_id: filters.workload_id,
                },
                signal,
              ),
              params,
            )
        : undefined,
    },
  );
  // The receiver doesn't accept a `since_hours` param on /v1/events, so we
  // apply the time-range filter client-side using `timestamp_hour`.
  const filtered = useMemo<LoadState<EventsResponse>>(() => {
    if (opts.sinceHours == null) return state;
    const since = Math.floor(Date.now() / 1000) - opts.sinceHours * 3600;
    const apply = (d: EventsResponse): EventsResponse => ({
      ...d,
      events: d.events.filter((e) => e.timestamp_hour >= since),
    });
    if (state.status === "ok") return { ...state, data: apply(state.data) };
    if (state.status === "loading" && state.previous)
      return { ...state, previous: apply(state.previous) };
    if (state.status === "error" && state.previous)
      return { ...state, previous: apply(state.previous) };
    return state;
  }, [state, opts.sinceHours]);
  return { state: filtered, refresh };
}

export function useAlertRules(
  opts: { pollMs?: number; refreshTrigger?: number } = {},
): { state: LoadState<AlertRulesResponse>; refresh: () => void } {
  const { demo, bench } = useAuth();
  return useApi<AlertRulesResponse>(
    demo || bench ? null : (c, signal) => getAlertRules(c, signal),
    [],
    {
      ...opts,
      // Alert rules pass through unchanged in demo mode — they're a
      // tenant-config concept, not a volume/cost concept.
      benchLoader: bench || demo ? (signal) => getAlertRulesBench(signal) : undefined,
    },
  );
}

export function useAlertDeliveries(
  opts: { pollMs?: number; refreshTrigger?: number } = {},
): { state: LoadState<AlertDeliveriesResponse>; refresh: () => void } {
  const { demo, bench } = useAuth();
  return useApi<AlertDeliveriesResponse>(
    demo || bench ? null : (c, signal) => getAlertDeliveries(c, signal),
    [],
    {
      ...opts,
      // Alert deliveries pass through unchanged in demo mode — see above.
      benchLoader:
        bench || demo ? (signal) => getAlertDeliveriesBench(signal) : undefined,
    },
  );
}

export function useEventDetail(
  id: number | null,
): { state: LoadState<EventDetailResponse>; refresh: () => void } {
  const { demo, bench } = useAuth();
  return useApi<EventDetailResponse>(
    !demo && !bench && id !== null ? (c, signal) => getEventDetail(c, id, signal) : null,
    [id],
    {
      // EventDetail passes through unchanged in demo mode — the
      // per-iteration trajectory is the bench's measured one; replaying
      // it at scale doesn't change the shape.
      benchLoader:
        (bench || demo) && id !== null
          ? (signal) => getEventDetailBench(id, signal)
          : null,
    },
  );
}

export type { LoadState } from "./api";
