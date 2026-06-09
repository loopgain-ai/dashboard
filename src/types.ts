// Telemetry receiver wire types.
// Source of truth: the telemetry-receiver repo (src/index.ts + schema.sql).

/** Outcome strings emitted by the LoopGain library when a run terminates.
 *
 * "stalled" was added in loopgain-core v0.2 (trajectory classifier). It
 * means the trajectory classifier saw two-or-more consecutive STALLING
 * readings and terminated — "stuck but not flapping," distinct from the
 * actively-unstable "oscillating" outcome.
 */
export type Outcome =
  | "converged"
  | "oscillating"
  | "diverged"
  | "stalled"
  | "max_iterations"
  // Future-proof: anything else is rendered as "unknown".
  | (string & {});

/** The five Aβ-band names in the product spec. */
export type Band =
  | "FAST_CONVERGE"
  | "CONVERGING"
  | "STALLING"
  | "OSCILLATING"
  | "DIVERGING";

/** GET /v1/stats response. */
export interface StatsResponse {
  customer_id: string;
  window_days: 30;
  since: number;
  outcomes: Array<{ outcome: Outcome; count: number }>;
  totals: {
    event_count: number;
    total_iterations: number;
    total_savings: number;
    rollbacks: number;
    /** Sum of actual_dollars_saved across matched events. NULL when no
     *  events have it populated. Receiver v3.1+ only — older receivers
     *  omit the field entirely, in which case the dashboard falls back
     *  to total_savings × costPerIter. The bench tenant populates it
     *  because it has paired B20/LG baseline cost data; ordinary
     *  customers don't. */
    total_actual_dollars_saved?: number | null;
    /** Count of events with actual_dollars_saved populated. */
    event_count_with_actual_savings?: number;
    /** Sum of actual_dollars_spent across matched events. Companion to
     *  total_actual_dollars_saved; same population semantics. Receiver
     *  v3.2+ only. When populated, the Waste panel uses it directly as
     *  the "actual spend" hero number instead of extrapolating from
     *  iter-count × $/iter. */
    total_actual_dollars_spent?: number | null;
    /** Count of events with actual_dollars_spent populated. */
    event_count_with_actual_spend?: number;
    /** Iteration-waste aggregates (receiver v3.5+, schema migration 0008).
     *  best_index is the 0-based lowest-error iteration. These drive the
     *  Convergence/Waste "no static cap works" panels; loopgain-verify
     *  `dash.live_iteration_waste` proves each equals a recompute from raw.
     *  Older receivers omit them and the panels fall back to the sample. */
    event_count_with_best_index?: number;
    /** Σ (iterations_used − 1 − best_index): iterations LoopGain ran past the
     *  best output (its residual grind, ~0 by design). */
    total_iterations_past_best?: number;
    /** Count of events whose best output was the first iteration (best_index = 0). */
    event_count_best_at_iter1?: number;
  } | null;
  workloads: Array<{ workload_id: string | null; count: number }>;
  // Schema v3: distinct values for the classification fields, used to
  // populate the filter bar's dropdowns. Empty arrays on v2-era receivers.
  frameworks?: Array<{ value: string; count: number }>;
  loop_types?: Array<{ value: string; count: number }>;
  teams?: Array<{ value: string; count: number }>;
  /** Tenant-wide percentile aggregates over the 30d window. Computed
   *  server-side so the dashboard doesn't have to median-over a
   *  recency-biased /events sample. Optional on older receivers.
   *
   *  Receiver v0.3.1+ (2026-05-25):
   *  - ab_median/ab_p99 now exclude rows with NULL profile_max
   *    (was COALESCE(profile_max, 0) → 0 on TARGET_MET-at-iter-1
   *    workloads).
   *  - by_outcome adds fleet-wide per-outcome rollups: actual
   *    paired-baseline dollar savings, iterations used vs avoided,
   *    event counts. Lets the dashboard render measured savings
   *    breakdowns instead of extrapolating from an events sample. */
  aggregates?: {
    ab_median: number | null;
    ab_p99: number | null;
    gm_median: number | null;
    gm_p10: number | null;
    by_outcome?: Array<{
      outcome: Outcome;
      events: number;
      iterations_used: number;
      iterations_avoided: number;
      actual_dollars_saved: number | null;
    }>;
  };
}

/** Classification labels (schema v3). All optional, all opaque strings. */
export interface Classification {
  framework?: string | null;
  loop_type?: string | null;
  team?: string | null;
}

/** Per-iteration trajectory data (schema v3). Capped at 256 entries. */
export interface PerIteration {
  convergence_profile: number[];
  error_history: number[];
  truncated: boolean;
  cap: number;
}

/** A profile event returned from GET /v1/profiles. */
export interface ProfileEvent extends Classification {
  id?: number;
  timestamp_hour: number;
  workload_id?: string | null;
  profile_min: number | null;
  profile_max: number | null;
  profile_median: number | null;
  profile_samples: number;
  outcome: Outcome;
  iterations_used: number;
}

/** GET /v1/profiles response. */
export interface ProfilesResponse {
  customer_id: string;
  workload_id: string | null;
  events: ProfileEvent[];
}

/** A loop event from GET /v1/events. */
export interface LoopEvent extends Classification {
  id?: number;
  timestamp_hour: number;
  workload_id: string | null;
  outcome: Outcome;
  iterations_used: number;
  profile_max: number | null;
  savings_vs_fixed_cap: number | null;
  /** 0-based iteration with the lowest error (argmin of error_history).
   *  iterations-to-best = best_index + 1. Receiver v3.5+ (migration 0008);
   *  NULL on events ingested before the column existed. */
  best_index: number | null;
  library_version: string;
}

/** GET /v1/events response. */
export interface EventsResponse {
  customer_id: string;
  events: LoopEvent[];
}

/** Full event detail returned by GET /v1/event/:id (schema v3). */
export interface EventDetail extends Classification {
  id: number;
  timestamp_hour: number;
  workload_id: string | null;
  library_version: string;
  outcome: Outcome;
  iterations_used: number;
  savings_vs_fixed_cap: number | null;
  rollback_triggered: number; // 0 | 1 (D1 boolean storage)
  profile_min: number | null;
  profile_max: number | null;
  profile_median: number | null;
  profile_samples: number;
  threshold_fast_converge: number;
  threshold_converging: number;
  threshold_stalling: number;
  threshold_oscillating_upper: number;
  smoothing_window: number;
  per_iteration: PerIteration | null;
  received_at: number;
}

/** GET /v1/event/:id response. */
export interface EventDetailResponse {
  event: EventDetail;
}

/** Active filter set, threaded through panels via context. */
export interface FilterSet {
  framework?: string;
  loop_type?: string;
  team?: string;
  workload_id?: string;
}

// ── Alerts (schema v3+) ────────────────────────────────────────────────

export type AlertOperator = ">" | ">=" | "<" | "<=" | "=";

export type AlertPredicate =
  | {
      metric: "outcome_count";
      outcome: Outcome;
      operator: AlertOperator;
      threshold: number;
    }
  | {
      metric: "rollback_count";
      operator: AlertOperator;
      threshold: number;
    }
  | {
      metric: "rollback_rate";
      operator: AlertOperator;
      threshold: number;
    };

export interface AlertFilter {
  workload_id?: string | null;
  framework?: string | null;
  loop_type?: string | null;
  team?: string | null;
}

export interface AlertRule {
  id: number;
  name: string;
  enabled: boolean;
  predicate: AlertPredicate;
  filter: AlertFilter | null;
  window_seconds: number;
  cooldown_seconds: number;
  action_type: "webhook";
  action_url: string;
  created_at: number;
  updated_at: number;
  last_fired_at: number | null;
}

export interface AlertRulePayload {
  name: string;
  enabled?: boolean;
  predicate: AlertPredicate;
  filter?: AlertFilter | null;
  window_seconds: number;
  cooldown_seconds?: number;
  action_type: "webhook";
  action_url: string;
  action_secret?: string | null;
}

export interface AlertRulesResponse {
  rules: AlertRule[];
}

export interface AlertRuleResponse {
  rule: AlertRule;
}

export interface AlertDelivery {
  id: number;
  rule_id: number;
  rule_name: string;
  fired_at: number;
  match_value: number;
  match_count: number;
  delivery_status: "sent" | "failed" | "skipped_cooldown";
  delivery_status_code: number | null;
  delivery_error: string | null;
}

export interface AlertDeliveriesResponse {
  deliveries: AlertDelivery[];
}

/** GET /health response. */
export interface HealthResponse {
  status: "ok";
  schema_version: number;
  service: string;
}

/** Local persisted config — what the user pasted into ConnectDialog. */
export interface Config {
  endpoint: string;
  token: string;
}
