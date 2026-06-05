// Iteration-waste display math — the "no static cap works" story.
//
// Pure, dependency-light functions that turn LoopGain telemetry into the
// numbers the Convergence (iterations-to-best) and Waste (iterations-past-best)
// panels display. Kept in lib/ (like stats.ts / format.ts) so loopgain-verify
// can drive the EXACT panel math through esbuild and pin every displayed
// number to a recompute from raw bench data — the Feature Gate.
//
// Definitions, per LoopGain event:
//   best_index           0-based iteration with the lowest error (argmin).
//   iterations-to-best   best_index + 1  (1-based, what a human reads).
//   LG grind-past-best   iterations_used - 1 - best_index  (iterations LG ran
//                        that produced nothing better — ~0 by design).
//   fixed-cap grind      FIXED_CAP_BASELINE - 1 - best_index  (what a static
//                        max_iter cap would grind past best instead).
//
// The product argument the panel makes: the best output lands at a different
// iteration for every loop, so NO single static cap is both cheap and safe —
// a low cap clips loops before their best, a high cap grinds past it. LoopGain
// stops each loop at its own best. (Mirrors loopgain-verify
// `thesis.iteration_waste`.)

import { median } from "./stats";

/** The prevailing naive baseline LoopGain replaces: a hardcoded max_iter cap.
 *  20 matches the bench's B20 condition (provable: 20·n − Σiters = Σsavings,
 *  see loopgain-verify `dash.live_savings`). */
export const FIXED_CAP_BASELINE = 20;

/** Quality cost of a FIXED CAP running past best — what max_iter=20 actually
 *  ships, not just in money. Measured on the 2,000-loop LoopGain benchmark over
 *  the 1,999 B20 (max_iter=20) trajectories whose best output was NOT the final
 *  (20th) iteration: the final/shipped answer's error vs. the best answer's
 *  error. This is the fixed cap's behaviour — the counterfactual LoopGain
 *  replaces — NOT LoopGain's own short overrun (which is near-circular: LG
 *  overruns only while detecting divergence, so its next reading is worse by
 *  selection). 706/1999 ship worse; the other 1,293 plateau (final == best).
 *
 *  NOT live-computable: the receiver carries best_index but not the per-iteration
 *  error_history, so the dashboard cannot derive this from a customer's own
 *  events. These are the benchmark figures, displayed as a labeled research
 *  receipt and pinned by loopgain-verify `thesis.degrades_past_best` (the claim
 *  holds on real loops) + `dash.ts_overrun_degrade_consts` (these exact numbers
 *  equal the raw recompute). If the bench is ever re-derived, those checks go
 *  red until these are updated. */
export const BENCH_OVERRUN = {
  /** Fraction of fixed-cap overrun loops whose SHIPPED (final) error is strictly
   *  worse than the best the loop already reached. (706 / 1999 on the bench;
   *  the remaining 0.647 plateaued — final == best.) */
  degradedFraction: 0.353,
  /** Median (final error / best error) among the loops that degraded. */
  degradedMedianX: 3.0,
  /** Worst observed (final error / best error) ratio. */
  degradedMaxX: 11.0,
} as const;

/** Per-event fields the iteration-waste math needs. */
export interface IWEvent {
  best_index: number | null;
  iterations_used: number;
}

/** The receiver's served /v1/stats totals this math consumes. Headline numbers
 *  come from these fleet aggregates (not the recency-capped /events sample) so
 *  the panel agrees with the rest of the dashboard and with the loopgain-verify
 *  `dash.live_iteration_waste` proof. */
export interface IWFleetTotals {
  event_count_with_best_index: number;
  event_count_best_at_iter1: number;
  total_iterations_past_best: number; // LG residual grind: Σ (iters-1-best_index)
  total_savings: number; // iterations LG avoided running: Σ (cap - iters)
}

export interface IWFleet {
  withBestIndex: number;
  bestAtIter1: number;
  bestPastIter1: number;
  pctBestAtIter1: number; // 0..1
  lgGrindTotal: number; // iterations LG ran past best
  fixedCapGrindTotal: number; // iterations a max_iter cap would run past best
  grindEliminated: number; // iterations eliminated (= total_savings)
  grindEliminatedPct: number; // 0..1
}

export function iterationWasteFleet(t: IWFleetTotals): IWFleet {
  const withBestIndex = t.event_count_with_best_index;
  const bestAtIter1 = t.event_count_best_at_iter1;
  const lgGrindTotal = t.total_iterations_past_best;
  // Fixed-cap counterfactual grind past best = LG residual + iterations LG
  // avoided running. Identity: Σ(cap-1-bi) = Σ(iters-1-bi) + Σ(cap-iters).
  // Both terms are served aggregates, so the counterfactual is exact, not
  // sampled.
  const fixedCapGrindTotal = lgGrindTotal + t.total_savings;
  const grindEliminated = t.total_savings;
  return {
    withBestIndex,
    bestAtIter1,
    bestPastIter1: withBestIndex - bestAtIter1,
    pctBestAtIter1: withBestIndex > 0 ? bestAtIter1 / withBestIndex : 0,
    lgGrindTotal,
    fixedCapGrindTotal,
    grindEliminated,
    grindEliminatedPct:
      fixedCapGrindTotal > 0 ? grindEliminated / fixedCapGrindTotal : 0,
  };
}

/** One bar of the iterations-to-best distribution. */
export interface IWBar {
  iter: number; // iterations-to-best (best_index + 1)
  count: number;
}

/** Sample-derived distribution + medians. The histogram and medians need
 *  per-event resolution, so they come from the /events sample (full 2,000 on
 *  the bench tenant; recency-capped for large customers). */
export interface IWSample {
  n: number;
  distribution: IWBar[]; // sorted by iter ascending
  medianIterationsToBest: number;
  maxIterationsToBest: number;
  fixedCapGrindMedian: number;
  lgGrindMedian: number;
}

function withBI(events: ReadonlyArray<IWEvent>): IWEvent[] {
  return events.filter(
    (e) => e.best_index != null && Number.isFinite(e.best_index),
  );
}

export function iterationWasteSample(events: ReadonlyArray<IWEvent>): IWSample {
  const rows = withBI(events);
  const itb = rows.map((e) => e.best_index! + 1);
  const counts = new Map<number, number>();
  for (const v of itb) counts.set(v, (counts.get(v) ?? 0) + 1);
  const distribution = [...counts.entries()]
    .map(([iter, count]) => ({ iter, count }))
    .sort((a, b) => a.iter - b.iter);
  return {
    n: rows.length,
    distribution,
    medianIterationsToBest: median(itb) ?? 0,
    maxIterationsToBest: itb.length ? Math.max(...itb) : 0,
    fixedCapGrindMedian:
      median(rows.map((e) => FIXED_CAP_BASELINE - 1 - e.best_index!)) ?? 0,
    lgGrindMedian: median(rows.map((e) => e.iterations_used - 1 - e.best_index!)) ?? 0,
  };
}

/** How many loops a static cap of `cap` ITERATIONS would have stopped BEFORE
 *  their best output (best landed at iteration > cap). The core "a low cap
 *  isn't safe" number — every one of these would have returned a worse result. */
export function falseStopsAtCap(
  events: ReadonlyArray<IWEvent>,
  cap: number,
): number {
  return withBI(events).filter((e) => e.best_index! + 1 > cap).length;
}
