// Telemetry receiver wire types.
// Source of truth: the telemetry-receiver repo (src/index.ts + schema.sql).

/** Outcome strings emitted by the LoopGain library when a run terminates. */
export type Outcome =
  | "converged"
  | "oscillating"
  | "diverged"
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
  } | null;
  workloads: Array<{ workload_id: string | null; count: number }>;
  // Schema v3: distinct values for the classification fields, used to
  // populate the filter bar's dropdowns. Empty arrays on v2-era receivers.
  frameworks?: Array<{ value: string; count: number }>;
  loop_types?: Array<{ value: string; count: number }>;
  teams?: Array<{ value: string; count: number }>;
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
  gain_margin: number | null;
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
  gain_margin: number | null;
  profile_max: number | null;
  savings_vs_fixed_cap: number | null;
  library_version: string;
  // Schema v2: first non-NULL eta snapshot captured during the loop, plus
  // the iteration count when it was captured. Both NULL on v1-era events
  // or when the library never produced a prediction.
  first_eta_prediction?: number | null;
  first_eta_at_iteration?: number | null;
}

/** GET /v1/events response. */
export interface EventsResponse {
  customer_id: string;
  events: LoopEvent[];
}

/** One row from GET /v1/calibration: a converged loop with a captured eta. */
export interface CalibrationEvent extends Classification {
  id?: number;
  timestamp_hour: number;
  workload_id: string | null;
  iterations_used: number;
  first_eta_prediction: number;
  first_eta_at_iteration: number;
  gain_margin: number | null;
  library_version: string;
}

/** GET /v1/calibration response. */
export interface CalibrationResponse {
  customer_id: string;
  workload_id: string | null;
  events: CalibrationEvent[];
}

/** Full event detail returned by GET /v1/event/:id (schema v3). */
export interface EventDetail extends Classification {
  id: number;
  timestamp_hour: number;
  workload_id: string | null;
  library_version: string;
  outcome: Outcome;
  iterations_used: number;
  gain_margin: number | null;
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
  first_eta_prediction: number | null;
  first_eta_at_iteration: number | null;
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
    }
  | {
      metric: "gain_margin_min";
      operator: "<" | "<=";
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
