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
}

/** A profile event returned from GET /v1/profiles. */
export interface ProfileEvent {
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
export interface LoopEvent {
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
export interface CalibrationEvent {
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
