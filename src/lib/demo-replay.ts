// Live REPLAY of recorded benchmark runs, for demo mode.
//
// The demo's numbers are deterministic projections (see demo.ts) — nothing
// moves, which reads as a static screenshot. This module adds motion the
// honest way: it replays REAL recorded runs from the public benchmark
// dataset, revealing one every few seconds from page load. No inference
// happens; every error trajectory, band and iteration count shown was
// measured when the bench actually ran. The UI labels this "LIVE REPLAY"
// and must always pair the word "live" with "replay"/"recorded"
// (claim-provenance rule; pinned by loopgain-verify
// dash.demo_replay_provenance).
//
// Deliberately SEPARATE from demo-params: params are persisted,
// seed-bearing buyer configuration (seedFromParams drives the stable
// projection numbers); replay is ephemeral per-visit session state. The
// pure transforms in demo.ts are not touched — coupling replay into them
// would re-seed the projections every tick and make every number flicker.
//
// Fetch pattern: ONE /v1/public/benchmark/events call, then event details
// prefetch in the background with bounded concurrency (the public
// endpoints are edge-cached ~5 min). The ticker starts revealing as soon
// as the FIRST detail lands — a cold visitor sees motion within a few
// seconds, not after the whole queue is warm.

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

export interface DemoReplay {
  /** True in demo mode once at least one recorded run is ready. */
  enabled: boolean;
  /** Recorded runs revealed so far this session, newest first. */
  revealed: ReadonlyArray<ReplayEvent>;
  /** The most recently revealed run (drives the animated trajectory). */
  latest: ReplayEvent | null;
  /** Queue fully replayed — the session's motion has ended. */
  exhausted: boolean;
}

const DISABLED: DemoReplay = {
  enabled: false,
  revealed: [],
  latest: null,
  exhausted: false,
};

/** ~20 runs × 3–5s ≈ 60–100s of motion per visit — plenty to feel alive;
 *  a reload starts a fresh replay with a different random queue. */
const QUEUE_SIZE = 20;
const PREFETCH_CONCURRENCY = 4;
const TICK_BASE_MS = 3000;
const TICK_JITTER_MS = 2000;
/** Retry cadence when the ticker outruns the prefetcher. */
const WAIT_FOR_PREFETCH_MS = 750;

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

/** Provider state machine: stream the queue in the background (demo only),
 *  reveal one recorded run per jittered tick while the tab is visible. */
export function useDemoReplayProvider(): DemoReplay {
  const { demo } = useAuth();
  // The queue grows as details land; a ref so the ticker never re-arms on
  // growth (re-arming would reset the pending tick each time).
  const queueRef = useRef<ReplayEvent[]>([]);
  const buildDone = useRef(false);
  const revealedCount = useRef(0);
  const [queueReady, setQueueReady] = useState(0);
  const [revealed, setRevealed] = useState<ReplayEvent[]>([]);

  // Background queue builder — once per visit. Streams items into
  // queueRef as their details arrive.
  useEffect(() => {
    if (!demo) return;
    const ctrl = new AbortController();
    queueRef.current = [];
    buildDone.current = false;
    revealedCount.current = 0;

    async function build(): Promise<void> {
      const res = await getEventsBench({}, ctrl.signal);
      const seen = new Set<number>();
      const pool = shuffle(
        res.events.filter((e) => {
          if (e.id == null || seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        }),
      );
      let cursor = 0;
      async function worker(): Promise<void> {
        while (cursor < pool.length && queueRef.current.length < QUEUE_SIZE) {
          const event = pool[cursor++]!;
          try {
            const detail = (await getEventDetailBench(event.id!, ctrl.signal)).event;
            if (detail.per_iteration && queueRef.current.length < QUEUE_SIZE) {
              queueRef.current.push({ event, detail, revealedAt: 0 });
              setQueueReady(queueRef.current.length);
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
        setQueueReady(queueRef.current.length);
      });
    return () => ctrl.abort();
  }, [demo]);

  // Ticker — reveal while visible; wait briefly when the prefetcher is
  // behind; pause when hidden; stop when the queue is built AND drained.
  useEffect(() => {
    if (!demo) return;
    let timer: number | null = null;
    let cancelled = false;

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
      const next = queueRef.current[revealedCount.current];
      if (!next) {
        if (!buildDone.current) schedule(WAIT_FOR_PREFETCH_MS);
        // else: drained — done for this session.
        return;
      }
      revealedCount.current += 1;
      setRevealed((prev) => [{ ...next, revealedAt: Date.now() }, ...prev]);
      schedule(TICK_BASE_MS + Math.random() * TICK_JITTER_MS);
    }

    function onVisibility(): void {
      if (document.visibilityState === "visible" && timer === null) {
        schedule(TICK_BASE_MS + Math.random() * TICK_JITTER_MS);
      }
    }

    schedule(TICK_BASE_MS + Math.random() * TICK_JITTER_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [demo]);

  if (!demo) return DISABLED;
  return {
    enabled: queueReady > 0,
    revealed,
    latest: revealed[0] ?? null,
    exhausted:
      buildDone.current && queueReady > 0 && revealed.length >= queueReady,
  };
}
