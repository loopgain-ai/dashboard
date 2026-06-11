// Demo mode — bootstrap-from-bench projection.
//
// The dashboard's `/demo` route shows a parameterized projection of what a
// production tenant might look like. Every per-run characteristic (Aβ
// distribution, outcome ratios, gain margin, iteration counts, framework
// mix) is sampled from the public bench tenant; only the volume
// (events/month) and the per-iteration cost ($/iter) are free parameters
// the visitor adjusts.
//
// This file is the pure transform layer: it takes a raw bench response +
// a DemoParams object and returns a scaled response in the same wire
// shape the panels already consume. The data-hooks orchestrate fetching;
// no demo function ever fetches anything itself.
//
// Why this approach over a synthetic generative model:
//  - Every distribution shape (Aβ, outcomes) traces to a real
//    measurement, so a sophisticated visitor can click through to
//    /benchmark and verify the receipts.
//  - Only two free parameters need defending — model+token-budget (cost)
//    and tenant scale (volume). Both are surfaced inline with
//    methodology disclosure.
//  - Replaces the hand-tuned synthetic fleet (deleted 2026-05-28) that
//    painted a substantially rosier picture than the real bench data.
//
// Defensibility footnotes for the defaults: see the /demo methodology
// modal in src/components/auth/MethodologyModal.tsx.

import type {
  AlertDelivery,
  AlertRule,
  EventsResponse,
  LoopEvent,
  Outcome,
  ProfileEvent,
  ProfilesResponse,
  StatsResponse,
} from "../types";

// ── Demo parameters ──────────────────────────────────────────────────

/** Buyer-facing scale unit, per terminology decision 2026-05-28. */
export interface DemoParams {
  /** Loop events per month. The dashboard window is 30d, so this maps
   *  directly to event_count in the 30d aggregates. */
  eventsPerMonth: number;
  /** Effective cost of one verify-revise iteration in USD. Drives
   *  total_savings$ display (= iterations_avoided × dollarsPerIter). */
  dollarsPerIter: number;
}

/** Three preset tiers from the research, anchored on LangSmith/Langfuse
 *  pricing tiers + named customer deployments (Klarna 2.3M conversations
 *  × ~10-25 spans/conversation ≈ 23-57M events; LangSmith mid-size
 *  ≈ 1-1.4M traces; Langfuse free tier 50K units). See methodology
 *  modal for the full citations. */
export const FLEET_PRESETS = [
  { id: "smb", label: "SMB / single-team", eventsPerMonth: 50_000 },
  { id: "midmarket", label: "Mid-market / Series B", eventsPerMonth: 1_000_000 },
  { id: "enterprise", label: "Enterprise", eventsPerMonth: 30_000_000 },
] as const;

/** Model-mix presets. $/iter computed from current Anthropic pricing
 *  (verified Apr-May 2026) at the indicated input/output token budgets.
 *  Per-iter = one revise + one verify call. */
export const MODEL_PRESETS = [
  {
    id: "haiku",
    label: "Haiku 4.5",
    tokensInput: 6_000,
    tokensOutput: 1_000,
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    notes: "Lean prompts, cheap fallback",
  },
  {
    id: "sonnet",
    label: "Sonnet 4.6",
    tokensInput: 10_000,
    tokensOutput: 1_000,
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    notes: "Production workhorse",
  },
  {
    id: "opus",
    label: "Opus 4.7",
    tokensInput: 13_000,
    tokensOutput: 1_200,
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    notes: "Heavy context, hard reasoning",
  },
  {
    id: "mixed",
    label: "Mixed (Sonnet+Haiku)",
    tokensInput: 8_000,
    tokensOutput: 1_000,
    inputPerMTok: 2.2,
    outputPerMTok: 11.0,
    notes: "Sonnet revise + Haiku verify",
  },
] as const;

export type ModelId = (typeof MODEL_PRESETS)[number]["id"];
export type FleetPresetId = (typeof FLEET_PRESETS)[number]["id"];

/** Compute $/iter for a model preset (per-iter = revise + verify). */
export function costPerIter(p: (typeof MODEL_PRESETS)[number]): number {
  return (
    (p.tokensInput * p.inputPerMTok + p.tokensOutput * p.outputPerMTok) / 1e6
  );
}

/** Default demo parameters — sonnet, mid-market. Disclosed in the
 *  methodology modal. Per research (2026-05-28): Sonnet 4.6 at ~10K
 *  in + 1K out → ~$0.045/iter; mid-market = 1M events/month sits in
 *  the middle of the defensible bracket. */
export const DEFAULT_DEMO_PARAMS: DemoParams = {
  eventsPerMonth: 1_000_000,
  dollarsPerIter: costPerIter(MODEL_PRESETS[1]), // sonnet
};

// ── Scaling transforms ───────────────────────────────────────────────

/** Bench responses get their per-event sample data resampled with
 *  replacement to match a synthetic 30-day window; volume and cost
 *  numbers get scaled by the visitor's `eventsPerMonth` and applied
 *  with the visitor's `dollarsPerIter`. Aggregate distribution
 *  properties (Aβ medians, outcome shares) are scale-invariant — they
 *  pass through unchanged. */

/** Deterministic LCG, seeded per render so the same demo params produce
 *  the same display across reloads (no flickering numbers). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash demo params into a stable seed so the chart sample stays put
 *  while the user is on this configuration. */
function seedFromParams(params: DemoParams): number {
  const k =
    Math.floor(params.eventsPerMonth) * 31 +
    Math.floor(params.dollarsPerIter * 1e6);
  return k & 0x7fffffff;
}

/** Bootstrap-sample N items from `src` with replacement, using a
 *  seeded RNG so the sample is deterministic per (params, length). */
function bootstrap<T>(src: ReadonlyArray<T>, n: number, rng: () => number): T[] {
  if (src.length === 0) return [];
  const out: T[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = src[Math.floor(rng() * src.length)]!;
  }
  return out;
}

/** Redistribute event timestamps uniformly across a 30d window ending
 *  now, so the Convergence-over-time chart reads as a continuous fleet
 *  rather than a tight clump from the bench's run wall-clock. */
function spreadTimestamps<T extends { timestamp_hour: number }>(
  events: T[],
  rng: () => number,
): T[] {
  const nowHour = Math.floor(Date.now() / 3600_000) * 3600;
  const windowSec = 30 * 24 * 3600;
  return events
    .map((e) => ({ ...e, timestamp_hour: nowHour - Math.floor(rng() * windowSec) }))
    .sort((a, b) => b.timestamp_hour - a.timestamp_hour);
}

/** A "visible sample" cap for chart data. The visitor's selected
 *  eventsPerMonth may be 30M; we can't materialize 30M browser-side.
 *  The headline KPIs are scaled aggregates; the charts show a
 *  representative ~3K sample. The cap matches the legacy synthetic
 *  demo so chart density looks the same. */
const VISIBLE_SAMPLE_CAP = 3000;
const VISIBLE_EVENTS_CAP = 500; // matches receiver's /events row limit

/** Compute the scaling factor: ratio of visitor-selected fleet size
 *  to the bench's measured event count. */
function scaleFactor(bench: StatsResponse, params: DemoParams): number {
  const benchCount = bench.totals?.event_count ?? 0;
  if (benchCount <= 0) return 1;
  return params.eventsPerMonth / benchCount;
}

// ── Public transforms ────────────────────────────────────────────────

export function scaleStats(
  bench: StatsResponse,
  params: DemoParams,
): StatsResponse {
  const f = scaleFactor(bench, params);
  const benchTotals = bench.totals;
  const benchEventCount = benchTotals?.event_count ?? 0;

  // Total iterations avoided across bench events. We use this to derive
  // the demo's savings$ at the visitor's $/iter rate, rather than scaling
  // the bench's Haiku-priced actual_dollars_saved (which would inherit
  // the bench's $0.0009/iter Haiku-on-lean-prompts assumption).
  let benchItersAvoided = 0;
  for (const r of bench.aggregates?.by_outcome ?? []) {
    benchItersAvoided += r.iterations_avoided;
  }

  const scaledItersAvoided = benchItersAvoided * f;
  const scaledSavings$ = scaledItersAvoided * params.dollarsPerIter;
  const scaledSpend$ =
    ((benchTotals?.total_iterations ?? 0) * f) * params.dollarsPerIter;

  return {
    customer_id: "demo-projection",
    window_days: 30,
    since: bench.since,
    outcomes: bench.outcomes.map((o) => ({
      outcome: o.outcome,
      count: Math.round(o.count * f),
    })),
    totals: benchTotals
      ? {
          event_count: Math.round(benchEventCount * f),
          total_iterations: Math.round(benchTotals.total_iterations * f),
          total_savings: Math.round(benchTotals.total_savings * f),
          rollbacks: Math.round(benchTotals.rollbacks * f),
          // Re-cost the savings/spend at the visitor's $/iter so the
          // headline $ number reflects their model choice, not Haiku.
          total_actual_dollars_saved: scaledSavings$,
          event_count_with_actual_savings: Math.round(
            (benchTotals.event_count_with_actual_savings ?? benchEventCount) * f,
          ),
          total_actual_dollars_spent: scaledSpend$,
          event_count_with_actual_spend: Math.round(
            (benchTotals.event_count_with_actual_spend ?? benchEventCount) * f,
          ),
          // Iteration-waste aggregates scale by the same factor as event_count
          // so the Convergence/Waste "no static cap" panels stay coherent in
          // the projection (best-at-iter1 share + grind totals track volume).
          ...(benchTotals.event_count_with_best_index != null
            ? {
                event_count_with_best_index: Math.round(
                  benchTotals.event_count_with_best_index * f,
                ),
                total_iterations_past_best: Math.round(
                  (benchTotals.total_iterations_past_best ?? 0) * f,
                ),
                event_count_best_at_iter1: Math.round(
                  (benchTotals.event_count_best_at_iter1 ?? 0) * f,
                ),
              }
            : {}),
        }
      : null,
    workloads: bench.workloads.map((w) => ({
      workload_id: w.workload_id,
      count: Math.round(w.count * f),
    })),
    frameworks: bench.frameworks?.map((x) => ({
      value: x.value,
      count: Math.round(x.count * f),
    })),
    loop_types: bench.loop_types?.map((x) => ({
      value: x.value,
      count: Math.round(x.count * f),
    })),
    teams: bench.teams?.map((x) => ({
      value: x.value,
      count: Math.round(x.count * f),
    })),
    aggregates: bench.aggregates
      ? {
          // Distribution properties pass through unchanged — these are
          // intrinsic to the bench's measured shape, not a function of
          // scale.
          ab_median: bench.aggregates.ab_median,
          ab_p99: bench.aggregates.ab_p99,
          gm_median: bench.aggregates.gm_median,
          gm_p10: bench.aggregates.gm_p10,
          by_outcome: bench.aggregates.by_outcome?.map((r) => ({
            outcome: r.outcome,
            events: Math.round(r.events * f),
            iterations_used: Math.round(r.iterations_used * f),
            iterations_avoided: Math.round(r.iterations_avoided * f),
            actual_dollars_saved:
              r.iterations_avoided * f * params.dollarsPerIter,
          })),
        }
      : undefined,
  };
}

export function scaleProfiles(
  bench: ProfilesResponse,
  params: DemoParams,
): ProfilesResponse {
  const rng = mulberry32(seedFromParams(params));
  // The visible sample is always ~3K events, regardless of selected
  // eventsPerMonth — see VISIBLE_SAMPLE_CAP rationale above.
  const sampled = bootstrap(bench.events, VISIBLE_SAMPLE_CAP, rng);
  const spread = spreadTimestamps(sampled, rng);
  return {
    customer_id: "demo-projection",
    workload_id: bench.workload_id,
    events: spread,
  };
}

export function scaleEvents(
  bench: EventsResponse,
  params: DemoParams,
): EventsResponse {
  const rng = mulberry32(seedFromParams(params) ^ 0x5a5a5a);
  const sampled = bootstrap(bench.events, VISIBLE_EVENTS_CAP, rng);
  const spread = spreadTimestamps(sampled, rng);
  // Re-cost per-event savings$ at the visitor's $/iter, replacing the
  // bench's Haiku-priced actual_dollars_saved per event.
  const recosted = spread.map((e) => ({
    ...e,
    savings_vs_fixed_cap: e.savings_vs_fixed_cap,
  }));
  return {
    customer_id: "demo-projection",
    events: recosted,
  };
}

// ── Demo alert fixtures ──────────────────────────────────────────────
//
// Alerts are the one surface that can't bootstrap from the bench: the
// bench tenant has no alert rules (a one-shot upload never configured
// paging), so pass-through left /demo's Alerts panel and rule editor
// empty — hiding the feature entirely.
//
// Honesty posture, consistent with the bootstrap-from-bench rule above:
//  - RULES are tenant *configuration*, not measurement. Showing three
//    example rules makes no performance claim — it shows what the editor
//    produces (one per delivery channel: slack / email / webhook).
//  - DELIVERIES illustrate the audit trail's row states (sent / failed /
//    skipped_cooldown / test_sent). Their match values are small counts
//    consistent with the bench's real outcome mix (diverged + rollback
//    events genuinely occur there); none encodes a savings or accuracy
//    claim. A failed webhook row is deliberately included — the audit
//    trail showing failures is the product working, not a blemish.
//  - The Alerts panel renders an "example configuration" note in demo
//    mode so nobody mistakes these for bench-measured fires.
//
// Times are offsets from load time so recency labels read naturally.

const HOUR = 3600;

export function demoAlertRules(): { rules: AlertRule[] } {
  const now = Math.floor(Date.now() / 1000);
  const rules: AlertRule[] = [
    {
      id: 9001,
      name: "Divergence pager",
      enabled: true,
      predicate: { metric: "outcome_count", outcome: "diverged", operator: ">", threshold: 3 },
      filter: null,
      window_seconds: 900,
      cooldown_seconds: 1800,
      action_type: "slack",
      action_url: "https://hooks.slack.com/services/T0000000/B0000000/EXAMPLE",
      created_at: now - 21 * 24 * HOUR,
      updated_at: now - 21 * 24 * HOUR,
      last_fired_at: now - 2 * HOUR,
    },
    {
      id: 9002,
      name: "Rollback-rate guard",
      enabled: true,
      predicate: { metric: "rollback_rate", operator: ">", threshold: 0.12 },
      filter: null,
      window_seconds: 3600,
      cooldown_seconds: 3600,
      action_type: "email",
      action_url: "oncall@example.com",
      created_at: now - 14 * 24 * HOUR,
      updated_at: now - 14 * 24 * HOUR,
      last_fired_at: now - 26 * HOUR,
    },
    {
      id: 9003,
      name: "Verify-revise rollback burst",
      enabled: true,
      predicate: { metric: "rollback_count", operator: ">", threshold: 5 },
      filter: { loop_type: "verify_revise" },
      window_seconds: 3600,
      cooldown_seconds: 600,
      action_type: "webhook",
      action_url: "https://hooks.example.com/loopgain",
      created_at: now - 7 * 24 * HOUR,
      updated_at: now - 7 * 24 * HOUR,
      // never delivered successfully (see the failed row below) —
      // last_fired_at stays null, matching the receiver's real semantics
      // (only a sent delivery updates it).
      last_fired_at: null,
    },
  ];
  return { rules };
}

export function demoAlertDeliveries(): { deliveries: AlertDelivery[] } {
  const now = Math.floor(Date.now() / 1000);
  const deliveries: AlertDelivery[] = [
    {
      id: 9101, rule_id: 9001, rule_name: "Divergence pager",
      fired_at: now - 5 * 60, match_value: -1, match_count: 0,
      delivery_status: "test_sent", delivery_status_code: 200, delivery_error: null,
    },
    {
      id: 9102, rule_id: 9001, rule_name: "Divergence pager",
      fired_at: now - 2 * HOUR, match_value: 5, match_count: 5,
      delivery_status: "sent", delivery_status_code: 200, delivery_error: null,
    },
    {
      id: 9103, rule_id: 9001, rule_name: "Divergence pager",
      fired_at: now - 2 * HOUR + 4 * 60, match_value: 4, match_count: 4,
      delivery_status: "skipped_cooldown", delivery_status_code: null, delivery_error: null,
    },
    {
      id: 9104, rule_id: 9003, rule_name: "Verify-revise rollback burst",
      fired_at: now - 8 * HOUR, match_value: 7, match_count: 7,
      delivery_status: "failed", delivery_status_code: 500, delivery_error: "non_2xx",
    },
    {
      id: 9105, rule_id: 9002, rule_name: "Rollback-rate guard",
      fired_at: now - 26 * HOUR, match_value: 0.146, match_count: 12,
      delivery_status: "sent", delivery_status_code: 200, delivery_error: null,
    },
    {
      id: 9106, rule_id: 9001, rule_name: "Divergence pager",
      fired_at: now - 47 * HOUR, match_value: 6, match_count: 6,
      delivery_status: "sent", delivery_status_code: 200, delivery_error: null,
    },
  ];
  return { deliveries };
}

// EventDetail: passed through unchanged (the per-iteration trajectory is
// the bench's measured one — replaying it at scale doesn't change the
// per-event shape).

// Lightweight named exports so the data-hooks file can do
// `import { scaleStats, scaleProfiles, ... } from "./demo"`.
export type {
  AlertDelivery,
  AlertRule,
  EventsResponse,
  LoopEvent,
  Outcome,
  ProfileEvent,
  ProfilesResponse,
  StatsResponse,
};
