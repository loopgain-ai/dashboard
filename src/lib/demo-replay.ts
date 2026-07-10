// Live REPLAY of the recorded benchmark run, for demo mode.
//
// v3 (2026-07-10): the demo replays the REAL bench run from a checkpoint
// near its end. On load the dashboard shows the true state the bench
// tenant's dashboard was in after the first `N − REPLAY_TAIL` recorded
// runs had landed; the remaining runs then arrive roughly one per second
// in their true recorded order, and every panel accrues each run's own
// measured deltas (the recompute lives in replay-core.ts — pure, pinned
// by loopgain-verify dash.demo_checkpoint_truth). When the tail is
// exhausted the replay loops back to the checkpoint.
//
// Honesty rail: no inference happens; every trajectory, band, iteration
// count and dollar shown was measured when the bench actually ran. The UI
// labels this "LIVE REPLAY" and must always pair the word "live" with
// "replay"/"recorded" (claim-provenance rule; pinned by loopgain-verify
// dash.demo_replay_provenance).
//
// Fetch pattern: ONE full /v1/public/benchmark/events call (the receiver
// serves the whole 2,000-run dataset; ~300KB, edge-cached ~5 min), then a
// small rolling look-ahead of event-detail fetches (~1/s while playing,
// cached across laps) that feeds the animated latest-run trajectory.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getEventDetailBench, getEventsBench, useAuth } from "./api";
import {
  checkpointIndex,
  cutoffFor,
  orderEvents,
  type ReplayCutoff,
} from "./replay-core";
import type { EventDetail, LoopEvent } from "../types";

export interface ReplayLatest {
  event: LoopEvent;
  detail: EventDetail | null;
  /** Wall-clock ms when this recorded run was revealed this session. */
  revealedAt: number;
}

export interface DemoReplay {
  /** True in demo mode once the recorded run is loaded. */
  enabled: boolean;
  /** pending until the events list resolves; failed = no replay this
   *  visit (data-hooks fall back to full-run pass-through). */
  status: "pending" | "ready" | "failed";
  /** The full recorded run in true arrival order (ascending). */
  ordered: ReadonlyArray<LoopEvent>;
  /** Index of the first replayed event — everything before it is the
   *  checkpoint state shown on load. */
  checkpoint: number;
  /** checkpoint + runs revealed so far this lap (≤ ordered.length). */
  visibleCount: number;
  /** Chronological cutoff for truncating any fetched row set. */
  cutoff: ReplayCutoff | null;
  /** The most recently revealed run (drives the animated trajectory). */
  latest: ReplayLatest | null;
  /** id → wall-clock reveal ms for runs revealed this lap (drives the
   *  feed's entrance animation + "replayed Ns ago" labels). */
  revealedMap: ReadonlyMap<number, number>;
  /** Completed laps through the tail (0 on the first pass). */
  lap: number;
}

const DISABLED: DemoReplay = {
  enabled: false,
  status: "pending",
  ordered: [],
  checkpoint: 0,
  visibleCount: 0,
  cutoff: null,
  latest: null,
  revealedMap: new Map(),
  lap: 0,
};

/** ~1 recorded run per second, lightly jittered so it reads organic. */
const TICK_BASE_MS = 950;
const TICK_JITTER_MS = 150;
/** First reveal lands almost immediately after the checkpoint renders. */
const FIRST_TICK_MS = 300;
/** Detail look-ahead: how many upcoming runs to keep prefetched for the
 *  trajectory animation. Small — steady state is ~1 request/s, and the
 *  cache makes laps after the first free. */
const DETAIL_LOOKAHEAD = 6;

export const DemoReplayContext = createContext<DemoReplay>(DISABLED);

export function useDemoReplay(): DemoReplay {
  return useContext(DemoReplayContext);
}

/** Provider state machine: load the recorded run once, render the
 *  checkpoint, then reveal one run per second while the tab is visible,
 *  looping the tail forever. */
export function useDemoReplayProvider(): DemoReplay {
  const { demo } = useAuth();
  const [status, setStatus] = useState<DemoReplay["status"]>("pending");
  const [ordered, setOrdered] = useState<LoopEvent[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [lap, setLap] = useState(0);
  const [latest, setLatest] = useState<ReplayLatest | null>(null);
  const checkpointRef = useRef(0);
  // Detail cache persists across laps — the second lap is fetch-free.
  const detailsRef = useRef(new Map<number, EventDetail>());
  const pendingDetailRef = useRef(new Set<number>());
  const revealedMapRef = useRef(new Map<number, number>());

  // ── Load the recorded run (once per visit) ─────────────────────────
  useEffect(() => {
    if (!demo) return;
    const ctrl = new AbortController();
    getEventsBench({}, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        const run = orderEvents(res.events);
        if (run.length === 0) {
          setStatus("failed");
          return;
        }
        checkpointRef.current = checkpointIndex(run.length);
        setOrdered(run);
        setVisibleCount(checkpointRef.current);
        setStatus("ready");
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setStatus("failed");
      });
    return () => ctrl.abort();
  }, [demo]);

  // ── Ticker: reveal while visible, loop the tail, prefetch ahead ────
  useEffect(() => {
    if (!demo || status !== "ready" || ordered.length === 0) return;
    let timer: number | null = null;
    let cancelled = false;
    const checkpoint = checkpointRef.current;

    function prefetchAhead(from: number): void {
      for (
        let i = from;
        i < Math.min(from + DETAIL_LOOKAHEAD, ordered.length);
        i++
      ) {
        const id = ordered[i]?.id;
        if (id == null || detailsRef.current.has(id) || pendingDetailRef.current.has(id)) {
          continue;
        }
        pendingDetailRef.current.add(id);
        getEventDetailBench(id)
          .then((res) => {
            detailsRef.current.set(id, res.event);
          })
          .catch(() => {
            /* a missed detail only skips one trajectory animation */
          })
          .finally(() => {
            pendingDetailRef.current.delete(id);
          });
      }
    }

    function schedule(delay: number): void {
      if (cancelled) return;
      timer = window.setTimeout(tick, delay);
    }

    function tick(): void {
      if (cancelled) return;
      if (document.visibilityState !== "visible") {
        // Paused — visibilitychange resumes.
        timer = null;
        return;
      }
      setVisibleCount((count) => {
        let next = count + 1;
        if (next > ordered.length) {
          // Tail exhausted — loop back to the checkpoint for a new lap.
          revealedMapRef.current = new Map();
          setLap((l) => l + 1);
          next = checkpoint + 1;
        }
        const revealed = ordered[next - 1]!;
        if (revealed.id != null) {
          revealedMapRef.current.set(revealed.id, Date.now());
        }
        setLatest({
          event: revealed,
          detail: revealed.id != null ? detailsRef.current.get(revealed.id) ?? null : null,
          revealedAt: Date.now(),
        });
        prefetchAhead(next);
        return next;
      });
      schedule(TICK_BASE_MS + Math.random() * TICK_JITTER_MS);
    }

    function onVisibility(): void {
      if (document.visibilityState === "visible" && timer === null) {
        schedule(TICK_BASE_MS + Math.random() * TICK_JITTER_MS);
      }
    }

    prefetchAhead(checkpoint);
    schedule(FIRST_TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [demo, status, ordered]);

  if (!demo) return DISABLED;
  return {
    enabled: status === "ready",
    status,
    ordered,
    checkpoint: checkpointRef.current,
    visibleCount,
    cutoff: status === "ready" ? cutoffFor(ordered, visibleCount) : null,
    latest,
    revealedMap: revealedMapRef.current,
    lap,
  };
}
