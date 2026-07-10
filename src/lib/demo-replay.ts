// Live REPLAY of recorded benchmark runs, for demo mode.
//
// The demo's numbers are deterministic projections (see demo.ts) — nothing
// moves, which reads as a static screenshot. This module adds motion the
// honest way: it replays REAL recorded runs from the public benchmark
// dataset, continuously — roughly two recorded runs per second, starting
// the moment the first run's details are prefetched. No inference
// happens; every error trajectory, band and iteration count shown was
// measured when the bench actually ran. The UI labels this "LIVE REPLAY"
// and must always pair the word "live" with "replay"/"recorded"
// (claim-provenance rule; pinned by loopgain-verify
// dash.demo_replay_provenance).
//
// At the demo's default mid-market scale (1M loop events/month ≈ 23 real
// loops/minute) a sub-second reveal cadence is the right order of
// magnitude for what a real operator would watch scroll past.
//
// Deliberately SEPARATE from demo-params: params are persisted,
// seed-bearing buyer configuration (seedFromParams drives the stable
// projection numbers); replay is ephemeral per-visit session state. The
// pure transforms in demo.ts are not touched.
//
// Fetch pattern: ONE /v1/public/benchmark/events call, then a bounded
// prefetch of ~40 event details (edge-cached ~5 min). The replay then
// CYCLES that pool indefinitely — reshuffled each lap — so an open tab
// generates ZERO sustained network traffic while staying in motion.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getEventDetailBench, getEventsBench, useAuth } from "./api";
import type { EventDetail, LoopEvent } from "../types";

export interface ReplayEvent {
  event: LoopEvent;
  detail: EventDetail;
  /** Wall-clock ms when this recorded run was revealed this session. */
  revealedAt: number;
}

/** Cumulative real deltas from every run replayed this session — each
 *  increment is the actual recorded run's own numbers, so panels that
 *  accrue these are adding what a live dashboard would have added when
 *  that run's telemetry landed. */
export interface ReplaySession {
  runs: number;
  iterations: number;
  savedIterations: number;
  rollbacks: number;
  /** Terminal outcome counts (converged / diverged / oscillating / …). */
  outcomes: Record<string, number>;
}

export interface DemoReplay {
  /** True in demo mode once at least one recorded run is ready. */
  enabled: boolean;
  /** Recently revealed recorded runs, newest first (capped — use
   *  `session` for cumulative numbers). */
  revealed: ReadonlyArray<ReplayEvent>;
  /** The most recently revealed run (drives the animated trajectory). */
  latest: ReplayEvent | null;
  session: ReplaySession;
}

const EMPTY_SESSION: ReplaySession = {
  runs: 0,
  iterations: 0,
  savedIterations: 0,
  rollbacks: 0,
  outcomes: {},
};

const DISABLED: DemoReplay = {
  enabled: false,
  revealed: [],
  latest: null,
  session: EMPTY_SESSION,
};

/** Pool of distinct recorded runs to cycle through. Big enough that a
 *  viewer never notices the lap boundary (a full lap at ~2 runs/s is
 *  ~20s of distinct runs, reshuffled each lap). */
const POOL_SIZE = 40;
const PREFETCH_CONCURRENCY = 4;
/** ~2 recorded runs per second, lightly jittered so it reads organic. */
const TICK_BASE_MS = 400;
const TICK_JITTER_MS = 250;
/** First reveal should land as soon as the first detail is prefetched. */
const FIRST_TICK_MS = 250;
/** Retry cadence when the ticker outruns the prefetcher. */
const WAIT_FOR_PREFETCH_MS = 400;
/** Feed only needs the recent tail; cumulative stats live in `session`. */
const REVEALED_CAP = 40;

export const DemoReplayContext = createContext<DemoReplay>(DISABLED);

export function useDemoReplay(): DemoReplay {
  return useContext(DemoReplayContext);
}

/** Fisher–Yates with Math.random — per-visit randomness is the point
 *  (unlike demo.ts's seeded RNG, which must be stable across renders). */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Provider state machine: stream the pool in the background (demo only),
 *  then reveal recorded runs on a sub-second ticker while the tab is
 *  visible, cycling the pool indefinitely. */
export function useDemoReplayProvider(): DemoReplay {
  const { demo } = useAuth();
  // The pool grows as details land; refs so the ticker never re-arms on
  // growth (re-arming would reset the pending tick each time).
  const poolRef = useRef<ReplayEvent[]>([]);
  const buildDone = useRef(false);
  // Index into the current lap's order; laps reshuffle.
  const orderRef = useRef<number[]>([]);
  const cursorRef = useRef(0);
  const [poolReady, setPoolReady] = useState(0);
  const [revealed, setRevealed] = useState<ReplayEvent[]>([]);
  const [session, setSession] = useState<ReplaySession>(EMPTY_SESSION);

  // Background pool builder — once per visit.
  useEffect(() => {
    if (!demo) return;
    const ctrl = new AbortController();
    poolRef.current = [];
    orderRef.current = [];
    cursorRef.current = 0;
    buildDone.current = false;

    async function build(): Promise<void> {
      const res = await getEventsBench({}, ctrl.signal);
      const seen = new Set<number>();
      const candidates = shuffle(
        res.events.filter((e) => {
          if (e.id == null || seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        }),
      );
      let cursor = 0;
      async function worker(): Promise<void> {
        while (cursor < candidates.length && poolRef.current.length < POOL_SIZE) {
          const event = candidates[cursor++]!;
          try {
            const detail = (await getEventDetailBench(event.id!, ctrl.signal)).event;
            if (detail.per_iteration && poolRef.current.length < POOL_SIZE) {
              poolRef.current.push({ event, detail, revealedAt: 0 });
              setPoolReady(poolRef.current.length);
            }
          } catch {
            // One failed detail fetch shouldn't kill the replay — skip it.
            if (ctrl.signal.aborted) return;
          }
        }
      }
      await Promise.all(
        Array.from({ length: PREFETCH_CONCURRENCY }, () => worker()),
      );
    }

    void build()
      .catch(() => {
        /* replay is progressive enhancement — a failed build means no motion */
      })
      .finally(() => {
        buildDone.current = true;
        setPoolReady(poolRef.current.length);
      });
    return () => ctrl.abort();
  }, [demo]);

  // Ticker — reveal while visible; wait briefly when the prefetcher is
  // behind; pause when hidden; cycle the pool forever (reshuffled laps).
  useEffect(() => {
    if (!demo) return;
    let timer: number | null = null;
    let cancelled = false;

    function nextFromPool(): ReplayEvent | null {
      const pool = poolRef.current;
      if (pool.length === 0) return null;
      // Start a new (re)shuffled lap when the order is exhausted or the
      // pool has grown past the current lap's snapshot.
      if (cursorRef.current >= orderRef.current.length) {
        orderRef.current = shuffle(pool.map((_, i) => i));
        cursorRef.current = 0;
      }
      const idx = orderRef.current[cursorRef.current++]!;
      return pool[idx] ?? null;
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
      const next = nextFromPool();
      if (!next) {
        if (!buildDone.current) schedule(WAIT_FOR_PREFETCH_MS);
        // else: pool never materialized — no motion this visit.
        return;
      }
      const stamped = { ...next, revealedAt: Date.now() };
      setRevealed((prev) => [stamped, ...prev].slice(0, REVEALED_CAP));
      setSession((s) => ({
        runs: s.runs + 1,
        iterations: s.iterations + stamped.event.iterations_used,
        savedIterations: s.savedIterations + (stamped.event.savings_vs_fixed_cap ?? 0),
        rollbacks:
          s.rollbacks + (stamped.detail.rollback_triggered ? 1 : 0),
        outcomes: {
          ...s.outcomes,
          [stamped.event.outcome]: (s.outcomes[stamped.event.outcome] ?? 0) + 1,
        },
      }));
      schedule(TICK_BASE_MS + Math.random() * TICK_JITTER_MS);
    }

    function onVisibility(): void {
      if (document.visibilityState === "visible" && timer === null) {
        schedule(TICK_BASE_MS + Math.random() * TICK_JITTER_MS);
      }
    }

    schedule(FIRST_TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [demo]);

  if (!demo) return DISABLED;
  return {
    enabled: poolReady > 0,
    revealed,
    latest: revealed[0] ?? null,
    session,
  };
}
