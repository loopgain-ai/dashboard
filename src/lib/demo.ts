// Deterministic synthetic telemetry for offline/demo use.
//
// Builds a 30-day fleet of fake loop events that satisfies the same response
// shapes the real receiver returns, so every panel renders against the same
// data layer in either mode.

import { median, percentile } from "./stats";
import type {
  AlertDelivery,
  AlertRule,
  CalibrationResponse,
  EventDetail,
  EventsResponse,
  LoopEvent,
  Outcome,
  PerIteration,
  ProfileEvent,
  ProfilesResponse,
  StatsResponse,
} from "../types";

// Demo classification mappings — per-workload framework / loop_type / team
// stamps so the filter bar has something to filter by in demo mode.
const FRAMEWORK_BY_WORKLOAD: Record<string, string> = {
  "rag-rewrite-A": "langgraph",
  "rag-rewrite-B": "langgraph",
  "sql-synth-prod": "crewai",
  "code-rewrite-eu": "autogen",
  "plan-critic-v3": "crewai",
  "summarize-eval": "langgraph",
  "unit-test-fix": "autogen",
  "spec-refine-v2": "langgraph",
  "extract-validate": "langgraph",
  "translate-grade-jp": "crewai",
  "agent-self-review": "autogen",
  "tilescope-rewrite": "autogen",
};
const LOOP_TYPE_BY_WORKLOAD: Record<string, string> = {
  "rag-rewrite-A": "rag_refine",
  "rag-rewrite-B": "rag_refine",
  "sql-synth-prod": "verify_revise",
  "code-rewrite-eu": "verify_revise",
  "plan-critic-v3": "tool_use_retry",
  "summarize-eval": "verify_revise",
  "unit-test-fix": "verify_revise",
  "spec-refine-v2": "verify_revise",
  "extract-validate": "rag_refine",
  "translate-grade-jp": "verify_revise",
  "agent-self-review": "tool_use_retry",
  "tilescope-rewrite": "verify_revise",
};
const TEAM_BY_WORKLOAD: Record<string, string> = {
  "rag-rewrite-A": "search-prod",
  "rag-rewrite-B": "search-prod",
  "sql-synth-prod": "data-platform",
  "code-rewrite-eu": "code-tools",
  "plan-critic-v3": "agents-platform",
  "summarize-eval": "ml-eval",
  "unit-test-fix": "code-tools",
  "spec-refine-v2": "agents-platform",
  "extract-validate": "data-platform",
  "translate-grade-jp": "i18n",
  "agent-self-review": "agents-platform",
  "tilescope-rewrite": "code-tools",
};

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
  { o: "converged", w: 0.62 },
  { o: "stalled", w: 0.12 },       // v0.2: trajectory classifier — 2+ consecutive STALLING
  { o: "oscillating", w: 0.08 },
  { o: "diverged", w: 0.06 },
  { o: "max_iterations", w: 0.12 },
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
  id: number;
  workload_id: string;
  library_version: string;
  savings_vs_fixed_cap: number;
  rollback_triggered: boolean;
  first_eta_prediction: number | null;
  first_eta_at_iteration: number | null;
  framework: string;
  loop_type: string;
  team: string;
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

  for (let i = 0; i < 3000; i++) {
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
      case "stalled":
        // v0.2 trajectory classifier: no significant slope, no oscillation,
        // 2+ consecutive STALLING readings. Aβ hovers in the [0.85, 0.95]
        // band without statistically significant motion.
        pMin = 0.82 + rng() * 0.06;
        pMax = 0.92 + rng() * 0.05;
        pMed = 0.88 + rng() * 0.04;
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
    const rollback =
      outcome === "diverged" ||
      (outcome === "oscillating" && rng() < 0.6) ||
      (outcome === "stalled" && rng() < 0.3);  // v0.2: stalled returns best-so-far

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
      id: i + 1, // demo IDs start at 1; deterministic across renders.
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
      library_version: "0.1.6",
      first_eta_prediction: firstEta,
      first_eta_at_iteration: firstEtaAt,
      framework: FRAMEWORK_BY_WORKLOAD[workload] ?? "langgraph",
      loop_type: LOOP_TYPE_BY_WORKLOAD[workload] ?? "verify_revise",
      team: TEAM_BY_WORKLOAD[workload] ?? "default",
    });
  }
  events.sort((a, b) => b.timestamp_hour - a.timestamp_hour);
  return events;
}

// Build a synthetic per-iteration trajectory consistent with this event's
// outcome and profile_max. Convergence_profile is one entry shorter than
// error_history (no Aβ for the first observation, matching the library).
function buildPerIteration(e: SyntheticEvent): PerIteration {
  const errors: number[] = [];
  const ab: number[] = [];
  const targetAB =
    e.outcome === "converged" ? Math.max(0.2, e.profile_median ?? 0.4) :
    e.outcome === "max_iterations" ? Math.max(0.6, e.profile_median ?? 0.7) :
    e.outcome === "stalled" ? Math.max(0.88, e.profile_median ?? 0.92) :
    e.outcome === "oscillating" ? 0.97 :
    1.08; // diverged
  let err = 1.0;
  errors.push(err);
  for (let i = 1; i < e.iterations_used; i++) {
    const jitter = (((i * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.1;
    const aBeta = Math.max(0.05, targetAB + jitter);
    err = err * aBeta;
    errors.push(err);
    ab.push(aBeta);
  }
  return {
    convergence_profile: ab,
    error_history: errors,
    truncated: false,
    cap: 256,
  };
}

// Helper to apply classification filters to a synthetic event list.
function applyFilters(
  evs: SyntheticEvent[],
  opts: {
    workloadId?: string;
    framework?: string;
    loop_type?: string;
    team?: string;
  },
): SyntheticEvent[] {
  let out = evs;
  if (opts.workloadId) out = out.filter((e) => e.workload_id === opts.workloadId);
  if (opts.framework) out = out.filter((e) => e.framework === opts.framework);
  if (opts.loop_type) out = out.filter((e) => e.loop_type === opts.loop_type);
  if (opts.team) out = out.filter((e) => e.team === opts.team);
  return out;
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
  // Distinct classification values for the filter bar dropdowns.
  const tally = (key: "framework" | "loop_type" | "team") => {
    const m = new Map<string, number>();
    for (const e of inWindow) m.set(e[key], (m.get(e[key]) ?? 0) + 1);
    return Array.from(m)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  };
  // Tenant-wide Aβ / gain-margin aggregates — mirror the receiver's
  // statsCore semantics so demo mode populates the Convergence panel's
  // Aβ statistics card (and the same fields read by Overview /
  // GainMargin). Aβ uses profile_max (excluding null rows: TARGET_MET-
  // at-iter-1 has no measurable Aβ); gain_margin excludes nulls too.
  const abValues = inWindow
    .map((e) => e.profile_max)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  const gmValues = inWindow
    .map((e) => e.gain_margin)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
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
    frameworks: tally("framework"),
    loop_types: tally("loop_type"),
    teams: tally("team"),
    aggregates: {
      ab_median: median(abValues),
      ab_p99: percentile(abValues, 0.99),
      gm_median: median(gmValues),
      gm_p10: percentile(gmValues, 0.1),
    },
  };
}

export function demoProfiles(
  opts: {
    workloadId?: string;
    sinceHours?: number;
    framework?: string;
    loop_type?: string;
    team?: string;
  } = {},
): ProfilesResponse {
  const since =
    Math.floor(Date.now() / 1000) - (opts.sinceHours ?? 30 * 24) * 3600;
  const evs = applyFilters(
    fleet().filter((e) => e.timestamp_hour >= since),
    opts,
  );
  return {
    customer_id: "demo-customer",
    workload_id: opts.workloadId ?? null,
    events: evs.slice(0, 3500).map((e) => ({
      id: e.id,
      timestamp_hour: e.timestamp_hour,
      workload_id: opts.workloadId ? undefined : e.workload_id,
      framework: e.framework,
      loop_type: e.loop_type,
      team: e.team,
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

export function demoEvents(
  opts: {
    rollbacksOnly?: boolean;
    framework?: string;
    loop_type?: string;
    team?: string;
    workload_id?: string;
  } = {},
): EventsResponse {
  let evs = applyFilters(fleet(), {
    workloadId: opts.workload_id,
    framework: opts.framework,
    loop_type: opts.loop_type,
    team: opts.team,
  });
  if (opts.rollbacksOnly) evs = evs.filter((e) => e.rollback_triggered);
  return {
    customer_id: "demo-customer",
    events: evs.slice(0, 3500).map((e) => ({
      id: e.id,
      timestamp_hour: e.timestamp_hour,
      workload_id: e.workload_id,
      framework: e.framework,
      loop_type: e.loop_type,
      team: e.team,
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
  opts: {
    workloadId?: string;
    sinceHours?: number;
    framework?: string;
    loop_type?: string;
    team?: string;
  } = {},
): CalibrationResponse {
  const since =
    Math.floor(Date.now() / 1000) - (opts.sinceHours ?? 30 * 24) * 3600;
  const filtered = applyFilters(
    fleet().filter(
      (e) =>
        e.outcome === "converged" &&
        e.first_eta_prediction !== null &&
        e.first_eta_at_iteration !== null &&
        e.timestamp_hour >= since,
    ),
    opts,
  );
  return {
    customer_id: "demo-customer",
    workload_id: opts.workloadId ?? null,
    events: filtered.slice(0, 3500).map((e) => ({
      id: e.id,
      timestamp_hour: e.timestamp_hour,
      workload_id: e.workload_id,
      framework: e.framework,
      loop_type: e.loop_type,
      team: e.team,
      iterations_used: e.iterations_used,
      first_eta_prediction: e.first_eta_prediction!,
      first_eta_at_iteration: e.first_eta_at_iteration!,
      gain_margin: e.gain_margin,
      library_version: e.library_version,
    })),
  };
}

export function demoEventDetail(id: number): EventDetail {
  const e = fleet().find((x) => x.id === id);
  if (!e) {
    // Fallback shape for unknown ids — shouldn't happen in normal demo flow.
    return {
      id,
      timestamp_hour: Math.floor(Date.now() / 1000),
      workload_id: null,
      library_version: "0.1.6",
      outcome: "converged",
      iterations_used: 0,
      gain_margin: null,
      savings_vs_fixed_cap: null,
      rollback_triggered: 0,
      profile_min: null,
      profile_max: null,
      profile_median: null,
      profile_samples: 0,
      threshold_fast_converge: 0.3,
      threshold_converging: 0.85,
      threshold_stalling: 0.95,
      threshold_oscillating_upper: 1.05,
      smoothing_window: 3,
      first_eta_prediction: null,
      first_eta_at_iteration: null,
      per_iteration: null,
      received_at: Math.floor(Date.now() / 1000),
    };
  }
  return {
    id: e.id,
    timestamp_hour: e.timestamp_hour,
    workload_id: e.workload_id,
    library_version: e.library_version,
    outcome: e.outcome,
    iterations_used: e.iterations_used,
    gain_margin: e.gain_margin,
    savings_vs_fixed_cap: e.savings_vs_fixed_cap,
    rollback_triggered: e.rollback_triggered ? 1 : 0,
    profile_min: e.profile_min,
    profile_max: e.profile_max,
    profile_median: e.profile_median,
    profile_samples: e.profile_samples,
    threshold_fast_converge: 0.3,
    threshold_converging: 0.85,
    threshold_stalling: 0.95,
    threshold_oscillating_upper: 1.05,
    smoothing_window: 3,
    first_eta_prediction: e.first_eta_prediction,
    first_eta_at_iteration: e.first_eta_at_iteration,
    per_iteration: buildPerIteration(e),
    framework: e.framework,
    loop_type: e.loop_type,
    team: e.team,
    received_at: e.timestamp_hour + 30,
  };
}

// ── Demo alert rules + deliveries ─────────────────────────────────────

export function demoAlertRules(): AlertRule[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: 1,
      name: "DIVERGING cluster",
      enabled: true,
      predicate: { metric: "outcome_count", outcome: "diverged", operator: ">", threshold: 3 },
      filter: null,
      window_seconds: 300,
      cooldown_seconds: 600,
      action_type: "webhook",
      action_url: "https://hooks.example.com/loopgain/diverging",
      created_at: now - 86400 * 14,
      updated_at: now - 86400 * 14,
      last_fired_at: now - 3600 * 6,
    },
    {
      id: 2,
      name: "Low gain margin on prod search",
      enabled: true,
      predicate: { metric: "gain_margin_min", operator: "<", threshold: 1.0 },
      filter: { team: "search-prod" },
      window_seconds: 600,
      cooldown_seconds: 1800,
      action_type: "webhook",
      action_url: "https://hooks.example.com/loopgain/gm-low",
      created_at: now - 86400 * 7,
      updated_at: now - 86400 * 2,
      last_fired_at: null,
    },
    {
      id: 3,
      name: "Rollback rate over 12% on LangGraph",
      enabled: false,
      predicate: { metric: "rollback_rate", operator: ">", threshold: 0.12 },
      filter: { framework: "langgraph" },
      window_seconds: 86400,
      cooldown_seconds: 86400,
      action_type: "webhook",
      action_url: "https://hooks.example.com/loopgain/rollback-rate",
      created_at: now - 86400 * 21,
      updated_at: now - 86400 * 1,
      last_fired_at: null,
    },
  ];
}

export function demoAlertDeliveries(): AlertDelivery[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: 1,
      rule_id: 1,
      rule_name: "DIVERGING cluster",
      fired_at: now - 3600 * 6,
      match_value: 5,
      match_count: 5,
      delivery_status: "sent",
      delivery_status_code: 200,
      delivery_error: null,
    },
    {
      id: 2,
      rule_id: 1,
      rule_name: "DIVERGING cluster",
      fired_at: now - 3600 * 12,
      match_value: 4,
      match_count: 4,
      delivery_status: "sent",
      delivery_status_code: 202,
      delivery_error: null,
    },
    {
      id: 3,
      rule_id: 2,
      rule_name: "Low gain margin on prod search",
      fired_at: now - 86400 * 1.4,
      match_value: 0.83,
      match_count: 2,
      delivery_status: "failed",
      delivery_status_code: 502,
      delivery_error: "non_2xx",
    },
    {
      id: 4,
      rule_id: 1,
      rule_name: "DIVERGING cluster",
      fired_at: now - 86400 * 2,
      match_value: 6,
      match_count: 6,
      delivery_status: "skipped_cooldown",
      delivery_status_code: null,
      delivery_error: null,
    },
  ];
}
