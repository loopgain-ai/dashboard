// Deterministic synthetic telemetry for offline/demo use.
//
// Builds a 30-day fleet of fake loop events that satisfies the same response
// shapes the real receiver returns, so every panel renders against the same
// data layer in either mode.

import type {
  CalibrationResponse,
  EventsResponse,
  LoopEvent,
  Outcome,
  ProfileEvent,
  ProfilesResponse,
  StatsResponse,
} from "../types";

const SEED = 0x9e3779b9;

function makeRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORKLOADS = [
  "rag-rewrite-A",
  "rag-rewrite-B",
  "sql-synth-prod",
  "code-rewrite-eu",
  "plan-critic-v3",
  "summarize-eval",
  "unit-test-fix",
  "spec-refine-v2",
  "extract-validate",
  "translate-grade-jp",
  "agent-self-review",
  "tilescope-rewrite",
];

const OUTCOMES: Array<{ o: Outcome; w: number }> = [
  { o: "converged", w: 0.66 },
  { o: "oscillating", w: 0.10 },
  { o: "diverged", w: 0.07 },
  { o: "max_iterations", w: 0.17 },
];

function pickOutcome(rng: () => number): Outcome {
  const r = rng();
  let acc = 0;
  for (const { o, w } of OUTCOMES) {
    acc += w;
    if (r < acc) return o;
  }
  return "converged";
}

interface SyntheticEvent extends ProfileEvent, Omit<LoopEvent, "workload_id"> {
  workload_id: string;
  library_version: string;
  savings_vs_fixed_cap: number;
  rollback_triggered: boolean;
  first_eta_prediction: number | null;
  first_eta_at_iteration: number | null;
}

// Per-workload calibration bias for the demo fleet. Most workloads have
// near-zero bias (the prediction is well-calibrated); a couple are
// deliberately skewed to give the ETA Accuracy panel something to surface.
// Bias is added to the predicted *total* — positive = optimistic predictions
// (we said 5 iters, actually took 7), negative = pessimistic.
const WORKLOAD_BIAS: Record<string, number> = {
  "rag-rewrite-A": 0,
  "rag-rewrite-B": 0,
  "sql-synth-prod": -1,
  "code-rewrite-eu": 0,
  "plan-critic-v3": 2, // optimistic; the calibration story for this workload
  "summarize-eval": 0,
  "unit-test-fix": 0,
  "spec-refine-v2": -2, // pessimistic
  "extract-validate": 0,
  "translate-grade-jp": 1,
  "agent-self-review": 0,
  "tilescope-rewrite": 0,
};

function buildFleet(): SyntheticEvent[] {
  const rng = makeRand(SEED);
  const now = Math.floor(Date.now() / 3600_000) * 3600;
  const events: SyntheticEvent[] = [];

  for (let i = 0; i < 380; i++) {
    const outcome = pickOutcome(rng);
    const workload = WORKLOADS[Math.floor(rng() * WORKLOADS.length)]!;
    const hoursBack = Math.floor(rng() * 30 * 24);
    const ts = now - hoursBack * 3600;

    // Median Aβ profile shape varies by outcome.
    let pMin: number, pMax: number, pMed: number;
    let iters: number;
    let gm: number;
    switch (outcome) {
      case "converged":
        pMin = 0.05 + rng() * 0.18;
        pMed = pMin + 0.05 + rng() * 0.45;
        pMax = Math.min(0.92, pMed + 0.05 + rng() * 0.15);
        iters = 2 + Math.floor(rng() * 6);
        gm = 1 / pMax;
        break;
      case "max_iterations":
        pMin = 0.45 + rng() * 0.25;
        pMed = pMin + 0.05 + rng() * 0.25;
        pMax = Math.min(0.94, pMed + 0.05 + rng() * 0.10);
        iters = 14 + Math.floor(rng() * 6);
        gm = 1 / pMax;
        break;
      case "oscillating":
        pMin = 0.55 + rng() * 0.25;
        pMax = 0.97 + rng() * 0.08;
        pMed = 0.93 + rng() * 0.04;
        iters = 8 + Math.floor(rng() * 8);
        gm = 1 / pMax;
        break;
      case "diverged":
        pMin = 0.6 + rng() * 0.3;
        pMax = 1.08 + rng() * 0.2;
        pMed = 0.98 + rng() * 0.08;
        iters = 4 + Math.floor(rng() * 5);
        gm = 1 / pMax;
        break;
      default:
        pMin = 0.3;
        pMed = 0.5;
        pMax = 0.7;
        iters = 5;
        gm = 1.4;
    }
    const savings = Math.max(0, 16 - iters);
    const rollback = outcome === "diverged" || (outcome === "oscillating" && rng() < 0.6);

    // Only converged loops carry a captured eta snapshot. Predicted total
    // = at_iteration + remaining; should match iterations_used plus the
    // per-workload bias and a small per-event jitter.
    let firstEta: number | null = null;
    let firstEtaAt: number | null = null;
    if (outcome === "converged" && iters >= 3) {
      const atIter = 2;
      const bias = WORKLOAD_BIAS[workload] ?? 0;
      const jitter = Math.round((rng() - 0.5) * 2); // -1, 0, or +1
      const predictedTotal = Math.max(atIter + 1, iters + bias + jitter);
      firstEta = predictedTotal - atIter;
      firstEtaAt = atIter;
    }

    events.push({
      timestamp_hour: ts,
      workload_id: workload,
      outcome,
      iterations_used: iters,
      gain_margin: gm,
      profile_min: pMin,
      profile_max: pMax,
      profile_median: pMed,
      profile_samples: iters,
      savings_vs_fixed_cap: savings,
      rollback_triggered: rollback,
      library_version: "0.1.0",
      first_eta_prediction: firstEta,
      first_eta_at_iteration: firstEtaAt,
    });
  }
  events.sort((a, b) => b.timestamp_hour - a.timestamp_hour);
  return events;
}

// Build once per session so all hooks see the same fleet.
let cached: SyntheticEvent[] | null = null;
function fleet(): SyntheticEvent[] {
  if (!cached) cached = buildFleet();
  return cached;
}

// ── Demo "responses" matching the real receiver shapes ────────────────

export function demoStats(): StatsResponse {
  const evs = fleet();
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const inWindow = evs.filter((e) => e.timestamp_hour >= since);
  const outcomeMap = new Map<Outcome, number>();
  for (const e of inWindow) outcomeMap.set(e.outcome, (outcomeMap.get(e.outcome) ?? 0) + 1);
  const workloadMap = new Map<string, number>();
  for (const e of inWindow) workloadMap.set(e.workload_id, (workloadMap.get(e.workload_id) ?? 0) + 1);
  return {
    customer_id: "demo-customer",
    window_days: 30,
    since,
    outcomes: Array.from(outcomeMap).map(([outcome, count]) => ({ outcome, count })),
    totals: {
      event_count: inWindow.length,
      total_iterations: inWindow.reduce((s, e) => s + e.iterations_used, 0),
      total_savings: inWindow.reduce((s, e) => s + e.savings_vs_fixed_cap, 0),
      rollbacks: inWindow.filter((e) => e.rollback_triggered).length,
    },
    workloads: Array.from(workloadMap)
      .map(([workload_id, count]) => ({ workload_id, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function demoProfiles(opts: { workloadId?: string; sinceHours?: number } = {}): ProfilesResponse {
  const since =
    Math.floor(Date.now() / 1000) - (opts.sinceHours ?? 30 * 24) * 3600;
  let evs = fleet().filter((e) => e.timestamp_hour >= since);
  if (opts.workloadId) evs = evs.filter((e) => e.workload_id === opts.workloadId);
  return {
    customer_id: "demo-customer",
    workload_id: opts.workloadId ?? null,
    events: evs.slice(0, 1000).map((e) => ({
      timestamp_hour: e.timestamp_hour,
      workload_id: opts.workloadId ? undefined : e.workload_id,
      profile_min: e.profile_min,
      profile_max: e.profile_max,
      profile_median: e.profile_median,
      profile_samples: e.profile_samples,
      outcome: e.outcome,
      iterations_used: e.iterations_used,
      gain_margin: e.gain_margin,
    })),
  };
}

export function demoEvents(opts: { rollbacksOnly?: boolean } = {}): EventsResponse {
  let evs = fleet();
  if (opts.rollbacksOnly) evs = evs.filter((e) => e.rollback_triggered);
  return {
    customer_id: "demo-customer",
    events: evs.slice(0, 500).map((e) => ({
      timestamp_hour: e.timestamp_hour,
      workload_id: e.workload_id,
      outcome: e.outcome,
      iterations_used: e.iterations_used,
      gain_margin: e.gain_margin,
      profile_max: e.profile_max,
      savings_vs_fixed_cap: e.savings_vs_fixed_cap,
      library_version: e.library_version,
      first_eta_prediction: e.first_eta_prediction,
      first_eta_at_iteration: e.first_eta_at_iteration,
    })),
  };
}

export function demoCalibration(
  opts: { workloadId?: string; sinceHours?: number } = {},
): CalibrationResponse {
  const since =
    Math.floor(Date.now() / 1000) - (opts.sinceHours ?? 30 * 24) * 3600;
  let evs = fleet().filter(
    (e) =>
      e.outcome === "converged" &&
      e.first_eta_prediction !== null &&
      e.first_eta_at_iteration !== null &&
      e.timestamp_hour >= since,
  );
  if (opts.workloadId) evs = evs.filter((e) => e.workload_id === opts.workloadId);
  return {
    customer_id: "demo-customer",
    workload_id: opts.workloadId ?? null,
    events: evs.slice(0, 1000).map((e) => ({
      timestamp_hour: e.timestamp_hour,
      workload_id: e.workload_id,
      iterations_used: e.iterations_used,
      first_eta_prediction: e.first_eta_prediction!,
      first_eta_at_iteration: e.first_eta_at_iteration!,
      gain_margin: e.gain_margin,
      library_version: e.library_version,
    })),
  };
}
