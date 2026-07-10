// Demo-mode fixtures.
//
// As of 2026-07-10 the /demo route is a checkpoint REPLAY of the real
// recorded benchmark run — every stat, dollar and trajectory is the bench
// tenant's own measured data, truncated to the replay's position (see
// src/lib/replay-core.ts + src/lib/demo-replay.ts). The former
// bootstrap-and-scale projection layer (the fleet-size + cost-per-iter
// knobs and their scaling transforms) was retired with that change:
// the demo shows only true recorded state now.
//
// What remains here are the ALERT fixtures — the one surface that can't
// come from the bench tenant: a one-shot upload never configured paging,
// so pass-through left /demo's Alerts panel and rule editor empty —
// hiding the feature entirely.
//
// Honesty posture:
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

import type { AlertDelivery, AlertRule } from "../types";

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
