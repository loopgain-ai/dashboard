// Checkpoint-replay core — PURE module (no React, no fetch) so
// loopgain-verify can execute the real code (dash.demo_checkpoint_truth).
//
// The /demo route replays the REAL recorded benchmark run from a
// checkpoint near its end: the dashboard first renders the true state the
// bench tenant's dashboard was in after the first `N - REPLAY_TAIL` runs
// had landed, then the remaining runs arrive one per second in their true
// recorded order. Every figure on every panel is therefore a measurement
// — the same numbers the bench operator saw mid-run — never a scaled or
// re-costed projection.
//
// The mechanism: fetch the full public bench events list once (it carries
// per-event iterations, savings, rollback flag, measured dollars and
// profile_max), order it chronologically, and recompute the /v1/stats
// aggregates client-side over the visible prefix using the SAME formulas
// statsCore runs in SQL. Replaying the full run must reproduce the served
// stats exactly — that equality is what the verify check pins.

import type {
  LoopEvent,
  Outcome,
  StatsResponse,
} from "../types";

/** How many runs from the end of the recorded run the replay plays.
 *  Checkpoint = everything before them, shown as already-landed state. */
export const REPLAY_TAIL = 1000;

/** Chronological cutoff: the last visible event's (timestamp_hour, id).
 *  Events are hour-stamped, so ordering within an hour is by ingest id —
 *  the same order `orderEvents` sorts by, which makes the cutoff exact
 *  for truncating ANY fetched subset (filtered events, profiles). */
export interface ReplayCutoff {
  ts: number;
  id: number;
}

/** Mirror of statsCore's calibration exclusion — deliberate
 *  forced-overrun runs never count toward "what LoopGain saved". */
const CALIBRATION_TEAM = "calibration";

/** The recorded run in true arrival order: ascending (timestamp_hour, id),
 *  de-duplicated, calibration rows excluded (mirrors statsCore). */
export function orderEvents(events: ReadonlyArray<LoopEvent>): LoopEvent[] {
  const seen = new Set<number>();
  const out: LoopEvent[] = [];
  for (const e of events) {
    if (e.id == null || seen.has(e.id)) continue;
    if (e.team === CALIBRATION_TEAM) continue;
    seen.add(e.id);
    out.push(e);
  }
  out.sort((a, b) =>
    a.timestamp_hour !== b.timestamp_hour
      ? a.timestamp_hour - b.timestamp_hour
      : (a.id ?? 0) - (b.id ?? 0),
  );
  return out;
}

/** Index of the first replayed event (everything before it is the
 *  checkpoint state). */
export function checkpointIndex(total: number, tail: number = REPLAY_TAIL): number {
  return Math.max(0, total - tail);
}

/** Cutoff for a visible prefix of the ordered run. null = nothing visible. */
export function cutoffFor(
  ordered: ReadonlyArray<LoopEvent>,
  visibleCount: number,
): ReplayCutoff | null {
  if (visibleCount <= 0 || ordered.length === 0) return null;
  const last = ordered[Math.min(visibleCount, ordered.length) - 1]!;
  return { ts: last.timestamp_hour, id: last.id ?? 0 };
}

/** Truncate any hour-stamped, id-bearing row set to the cutoff. Order is
 *  preserved; rows without ids are treated as id 0 (visible with their hour). */
export function truncateByCutoff<
  T extends { timestamp_hour: number; id?: number | null },
>(rows: ReadonlyArray<T>, cut: ReplayCutoff): T[] {
  return rows.filter(
    (r) =>
      r.timestamp_hour < cut.ts ||
      (r.timestamp_hour === cut.ts && (r.id ?? 0) <= cut.id),
  );
}

/** SQLite median over a sorted-ascending array: AVG of the two middle
 *  rows via rn IN ((total+1)/2, (total+2)/2) with integer division —
 *  identical for odd and even N (statsCore's percentileAgg). */
export function sqlMedian(sortedAsc: ReadonlyArray<number>): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  const lo = Math.floor((n + 1) / 2); // 1-based row numbers
  const hi = Math.floor((n + 2) / 2);
  return (sortedAsc[lo - 1]! + sortedAsc[hi - 1]!) / 2;
}

/** SQLite "smallest row past the cutoff fraction" percentile:
 *  MIN(v) WHERE rn/total >= frac. */
export function sqlPercentile(
  sortedAsc: ReadonlyArray<number>,
  frac: number,
): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  const rn = Math.max(1, Math.ceil(frac * n));
  return sortedAsc[rn - 1]!;
}

function groupCounts<K extends string>(
  rows: ReadonlyArray<LoopEvent>,
  key: (e: LoopEvent) => K | null | undefined,
): Array<{ value: K; count: number }> {
  const m = new Map<K, number>();
  for (const e of rows) {
    const k = key(e);
    if (k == null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m, ([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count,
  );
}

/** Recompute the /v1/stats aggregates over a visible prefix of the run,
 *  using the exact per-event formulas statsCore aggregates in SQL:
 *    total_iterations         = Σ iterations_used
 *    total_savings            = Σ savings_vs_fixed_cap
 *    rollbacks                = Σ rollback_triggered
 *    total_actual_dollars_*   = Σ actual_dollars_* (null when none present)
 *    iterations_past_best     = Σ (iterations_used − 1 − best_index)
 *    ab_median / ab_p99       = SQL-style percentiles over profile_max
 *
 *  `base` supplies the envelope fields that aren't event-derived
 *  (customer_id, tier, window, calibration flags). Passing the FULL run
 *  must reproduce `base` itself — pinned by dash.demo_checkpoint_truth. */
export function statsFromEvents(
  visible: ReadonlyArray<LoopEvent>,
  base: StatsResponse,
): StatsResponse {
  let totalIterations = 0;
  let totalSavings = 0;
  let rollbacks = 0;
  let dollarsSaved = 0;
  let savedCount = 0;
  let dollarsSpent = 0;
  let spentCount = 0;
  let withBestIndex = 0;
  let pastBest = 0;
  let bestAtIter1 = 0;
  const outcomeAgg = new Map<
    Outcome,
    { events: number; iterations_used: number; iterations_avoided: number; dollars: number; dollarsCount: number }
  >();
  const workloadCounts = new Map<string, number>();
  const abValues: number[] = [];

  for (const e of visible) {
    totalIterations += e.iterations_used;
    totalSavings += e.savings_vs_fixed_cap ?? 0;
    if (e.rollback_triggered === 1) rollbacks++;
    if (typeof e.actual_dollars_saved === "number") {
      dollarsSaved += e.actual_dollars_saved;
      savedCount++;
    }
    if (typeof e.actual_dollars_spent === "number") {
      dollarsSpent += e.actual_dollars_spent;
      spentCount++;
    }
    if (e.best_index != null) {
      withBestIndex++;
      pastBest += e.iterations_used - 1 - e.best_index;
      if (e.best_index === 0) bestAtIter1++;
    }
    if (e.profile_max != null) abValues.push(e.profile_max);

    const o = outcomeAgg.get(e.outcome) ?? {
      events: 0,
      iterations_used: 0,
      iterations_avoided: 0,
      dollars: 0,
      dollarsCount: 0,
    };
    o.events++;
    o.iterations_used += e.iterations_used;
    o.iterations_avoided += e.savings_vs_fixed_cap ?? 0;
    if (typeof e.actual_dollars_saved === "number") {
      o.dollars += e.actual_dollars_saved;
      o.dollarsCount++;
    }
    outcomeAgg.set(e.outcome, o);

    const w = e.workload_id ?? null;
    if (w != null) workloadCounts.set(w, (workloadCounts.get(w) ?? 0) + 1);
  }

  abValues.sort((a, b) => a - b);

  return {
    ...base,
    outcomes: Array.from(outcomeAgg, ([outcome, o]) => ({
      outcome,
      count: o.events,
    })),
    totals: {
      event_count: visible.length,
      total_iterations: totalIterations,
      total_savings: totalSavings,
      rollbacks,
      total_actual_dollars_saved: savedCount > 0 ? dollarsSaved : null,
      event_count_with_actual_savings: savedCount,
      total_actual_dollars_spent: spentCount > 0 ? dollarsSpent : null,
      event_count_with_actual_spend: spentCount,
      event_count_with_best_index: withBestIndex,
      total_iterations_past_best: pastBest,
      event_count_best_at_iter1: bestAtIter1,
    },
    workloads: Array.from(workloadCounts, ([workload_id, count]) => ({
      workload_id,
      count,
    })).sort((a, b) => b.count - a.count),
    frameworks: groupCounts(visible, (e) => e.framework),
    loop_types: groupCounts(visible, (e) => e.loop_type),
    teams: groupCounts(visible, (e) => e.team),
    aggregates: {
      ab_median: sqlMedian(abValues),
      ab_p99: sqlPercentile(abValues, 0.99),
      gm_median: base.aggregates?.gm_median ?? null,
      gm_p10: base.aggregates?.gm_p10 ?? null,
      by_outcome: Array.from(outcomeAgg, ([outcome, o]) => ({
        outcome,
        events: o.events,
        iterations_used: o.iterations_used,
        iterations_avoided: o.iterations_avoided,
        actual_dollars_saved: o.dollarsCount > 0 ? o.dollars : null,
      })).sort((a, b) => b.events - a.events),
    },
  };
}

/** Hourly arrival buckets across the run so far — the true recorded
 *  timeline (timestamp_hour is already hour-truncated by the library).
 *  Returns one bucket per hour from the run's first hour to the hour of
 *  the last visible event, zeros included, so the pulse chart shows the
 *  run's real arrival pattern growing as the replay advances. */
export function runPulse(
  visible: ReadonlyArray<LoopEvent>,
): Array<{ hour: number; count: number }> {
  if (visible.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  const counts = new Map<number, number>();
  for (const e of visible) {
    const h = e.timestamp_hour;
    if (h < min) min = h;
    if (h > max) max = h;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const out: Array<{ hour: number; count: number }> = [];
  for (let h = min; h <= max; h += 3600) {
    out.push({ hour: h, count: counts.get(h) ?? 0 });
  }
  return out;
}

/** Classification-filter predicate — the same exact-match semantics the
 *  receiver's classificationFilters applies in SQL, so demo-mode
 *  client-side filtering agrees with the server-filtered events routes. */
export function matchesFilters(
  e: LoopEvent,
  f: {
    framework?: string;
    loop_type?: string;
    team?: string;
    workload_id?: string;
  },
): boolean {
  if (f.framework != null && e.framework !== f.framework) return false;
  if (f.loop_type != null && e.loop_type !== f.loop_type) return false;
  if (f.team != null && e.team !== f.team) return false;
  if (f.workload_id != null && e.workload_id !== f.workload_id) return false;
  return true;
}

/** Cumulative measured savings across the run so far — one point per
 *  visible run, so the demo's live chart moves with EVERY replayed loop
 *  (an arrival-rate chart would be a flat line at the replay's constant
 *  ~1 run/s cadence). The last point equals the truncated stats hero's
 *  total_actual_dollars_saved by construction — same column, same
 *  prefix (pinned by dash.demo_checkpoint_truth). */
export function savingsAccrual(visible: ReadonlyArray<LoopEvent>): number[] {
  const out: number[] = new Array(visible.length);
  let sum = 0;
  for (let i = 0; i < visible.length; i++) {
    sum += visible[i]!.actual_dollars_saved ?? 0;
    out[i] = sum;
  }
  return out;
}
