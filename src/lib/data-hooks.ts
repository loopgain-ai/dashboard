// Higher-level data hooks. Each returns the typed response in one of
// three modes:
//   - live  → real receiver via authed `/v1/*` endpoints
//   - bench → public `/v1/public/benchmark/*` endpoints, scoped on the
//             receiver side to the hardcoded canonical bench tenant.
//   - demo  → the SAME public bench fetch, truncated to the replay's
//             chronological cutoff so every panel shows the true state
//             the bench tenant's dashboard was in at that point of the
//             recorded run (see src/lib/replay-core.ts). Stats are
//             recomputed client-side over the visible prefix with the
//             exact statsCore formulas; nothing is scaled or re-costed.
// Both bench-mode and demo-mode use the `benchLoader` path in useApi;
// demo adds the replay truncation as a post-transform.

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
import { useDemoReplay, type DemoReplay } from "./demo-replay";
import { matchesFilters, statsFromEvents, truncateByCutoff } from "./replay-core";
import { demoAlertDeliveries, demoAlertRules } from "./demo";
import type {
  AlertDeliveriesResponse,
  AlertRulesResponse,
  EventDetailResponse,
  EventsResponse,
  ProfilesResponse,
  StatsResponse,
} from "../types";

/** Map a LoadState<T> through a pure transform (ok data + any carried
 *  `previous` payloads), used to apply the demo replay truncation. */
function mapState<T>(state: LoadState<T>, fn: (d: T) => T): LoadState<T> {
  if (state.status === "ok") return { ...state, data: fn(state.data) };
  if (state.status === "loading" && state.previous)
    return { ...state, previous: fn(state.previous) };
  if (state.status === "error" && state.previous)
    return { ...state, previous: fn(state.previous) };
  return state;
}

/** While the demo replay is still loading the recorded run, hold panels
 *  in `loading` — rendering the full-run totals for a beat and then
 *  snapping back to the checkpoint would read as the numbers "dropping". */
function holdForReplay<T>(state: LoadState<T>, replay: DemoReplay): LoadState<T> {
  if (replay.status !== "pending") return state;
  if (state.status === "ok") return { status: "loading", previous: state.data };
  return state.status === "idle" ? state : { status: "loading" };
}

export function useStats(
  opts: {
    pollMs?: number;
    includeCalibration?: boolean;
    /** Skip the demo-mode filter application. The FilterBar's own
     *  dropdowns (and the command palette's workload list) need the
     *  UNfiltered option sets — feeding them filtered stats would
     *  collapse every other option the moment one is picked. */
    unfiltered?: boolean;
  } = {},
): {
  state: LoadState<StatsResponse>;
  refresh: () => void;
} {
  const { demo, bench } = useAuth();
  const replay = useDemoReplay();
  const { filters } = useFilters();
  const { state, refresh } = useApi<StatsResponse>(
    demo || bench
      ? null
      : (c, signal) => getStats(c, { includeCalibration: opts.includeCalibration }, signal),
    [opts.includeCalibration ?? false],
    {
      ...opts,
      benchLoader: bench || demo ? (signal) => getStatsBench(signal) : undefined,
    },
  );
  // Demo: recompute the aggregates over the replay's visible prefix of
  // the recorded run — respecting the active classification filters, so
  // the gauge/heroes/KPIs move with the filter bar like everything else.
  // Full unfiltered prefix (= whole run) reproduces the served stats
  // exactly — pinned by loopgain-verify dash.demo_checkpoint_truth.
  const truncated = useMemo<LoadState<StatsResponse>>(() => {
    if (!demo) return state;
    if (replay.status !== "ready" || !replay.cutoff) {
      return holdForReplay(state, replay);
    }
    let visible = replay.ordered.slice(0, replay.visibleCount);
    if (!opts.unfiltered) {
      visible = visible.filter((e) => matchesFilters(e, filters));
    }
    return mapState(state, (d) => statsFromEvents(visible, d));
  }, [
    state,
    demo,
    replay.status,
    replay.cutoff,
    replay.ordered,
    replay.visibleCount,
    filters,
    opts.unfiltered,
  ]);
  return { state: truncated, refresh };
}

export function useProfiles(
  opts: { workloadId?: string; sinceHours?: number; pollMs?: number; includeCalibration?: boolean } = {},
): { state: LoadState<ProfilesResponse>; refresh: () => void } {
  const { demo, bench } = useAuth();
  const replay = useDemoReplay();
  const { filters } = useFilters();
  // workloadId from props overrides the global filter (used by Loop Detail
  // to pin to a single workload regardless of the filter bar).
  const effectiveWorkload = opts.workloadId ?? filters.workload_id;
  const benchParams = {
    workloadId: effectiveWorkload,
    sinceHours: opts.sinceHours,
    framework: filters.framework,
    loop_type: filters.loop_type,
    team: filters.team,
    includeCalibration: opts.includeCalibration,
  };
  const { state, refresh } = useApi<ProfilesResponse>(
    demo || bench
      ? null
      : (c, signal) => getProfiles(c, benchParams, signal),
    [
      effectiveWorkload,
      opts.sinceHours,
      filters.framework,
      filters.loop_type,
      filters.team,
      opts.includeCalibration ?? false,
    ],
    {
      pollMs: opts.pollMs,
      benchLoader:
        bench || demo
          ? (signal) => getProfilesBench(benchParams, signal)
          : undefined,
    },
  );
  const truncated = useMemo<LoadState<ProfilesResponse>>(() => {
    if (!demo) return state;
    const cut = replay.cutoff;
    if (replay.status !== "ready" || !cut) return holdForReplay(state, replay);
    return mapState(state, (d) => ({
      ...d,
      events: truncateByCutoff(d.events, cut),
    }));
  }, [state, demo, replay.status, replay.cutoff, replay]);
  return { state: truncated, refresh };
}

export function useEvents(
  opts: { rollbacksOnly?: boolean; sinceHours?: number; pollMs?: number; includeCalibration?: boolean } = {},
): { state: LoadState<EventsResponse>; refresh: () => void } {
  const { demo, bench } = useAuth();
  const replay = useDemoReplay();
  const { filters } = useFilters();
  const benchParams = {
    rollbacksOnly: opts.rollbacksOnly,
    framework: filters.framework,
    loop_type: filters.loop_type,
    team: filters.team,
    workload_id: filters.workload_id,
    includeCalibration: opts.includeCalibration,
  };
  const { state, refresh } = useApi<EventsResponse>(
    demo || bench
      ? null
      : (c, signal) => getEvents(c, benchParams, signal),
    [
      opts.rollbacksOnly ?? false,
      filters.framework,
      filters.loop_type,
      filters.team,
      filters.workload_id,
      opts.includeCalibration ?? false,
    ],
    {
      pollMs: opts.pollMs,
      benchLoader:
        bench || demo
          ? (signal) => getEventsBench(benchParams, signal)
          : undefined,
    },
  );
  // Demo replay truncation. The server orders by timestamp_hour DESC only
  // (ids within an hour come back in arbitrary order), so re-sort DESC by
  // (hour, id) — the replay reveals ids ascending within an hour, which
  // makes the head of this list the most recently replayed run.
  const replayed = useMemo<LoadState<EventsResponse>>(() => {
    if (!demo) return state;
    const cut = replay.cutoff;
    if (replay.status !== "ready" || !cut) return holdForReplay(state, replay);
    return mapState(state, (d) => ({
      ...d,
      events: truncateByCutoff(d.events, cut).sort((a, b) =>
        a.timestamp_hour !== b.timestamp_hour
          ? b.timestamp_hour - a.timestamp_hour
          : (b.id ?? 0) - (a.id ?? 0),
      ),
    }));
  }, [state, demo, replay.status, replay.cutoff, replay]);
  // The receiver doesn't accept a `since_hours` param on /v1/events, so we
  // apply the time-range filter client-side using `timestamp_hour`.
  const filtered = useMemo<LoadState<EventsResponse>>(() => {
    if (opts.sinceHours == null) return replayed;
    const since = Math.floor(Date.now() / 1000) - opts.sinceHours * 3600;
    return mapState(replayed, (d) => ({
      ...d,
      events: d.events.filter((e) => e.timestamp_hour >= since),
    }));
  }, [replayed, opts.sinceHours]);
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
      // Bench mode passes through the real (empty) bench tenant — the
      // /benchmark view is provenance-pure. Demo mode serves the example
      // rule fixtures instead: the bench tenant never configured alerts,
      // so pass-through left the feature invisible. See demo.ts for the
      // honesty rationale (rules are config, not measurement).
      benchLoader: bench
        ? (signal) => getAlertRulesBench(signal)
        : demo
        ? async () => demoAlertRules()
        : undefined,
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
      // Bench: real pass-through; demo: example audit-trail fixtures —
      // see useAlertRules above and demo.ts.
      benchLoader: bench
        ? (signal) => getAlertDeliveriesBench(signal)
        : demo
        ? async () => demoAlertDeliveries()
        : undefined,
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
      // EventDetail passes through unchanged in demo mode — it's the
      // recorded run's own measured per-iteration trajectory.
      benchLoader:
        (bench || demo) && id !== null
          ? (signal) => getEventDetailBench(id, signal)
          : null,
    },
  );
}

export type { LoadState } from "./api";
