// Higher-level data hooks. Each returns the typed response in either
// "live" mode (real receiver) or "demo" mode (synthetic fleet).

import { useMemo } from "react";
import {
  getEvents,
  getProfiles,
  getStats,
  useApi,
  useAuth,
  type LoadState,
} from "./api";
import { demoEvents, demoProfiles, demoStats } from "./demo";
import type { EventsResponse, ProfilesResponse, StatsResponse } from "../types";

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
  opts: { rollbacksOnly?: boolean; pollMs?: number } = {},
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
  if (demo) return { state: demoState, refresh };
  return { state, refresh };
}

export type { LoadState } from "./api";
