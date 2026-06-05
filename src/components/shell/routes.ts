// Route definitions for the dashboard. Routes are simple string IDs;
// the loop detail uses a `loop:<workload_id>` pattern.

import type { IconName } from "../primitives/Icon";

export interface NavItem {
  id: RouteId;
  label: string;
  icon: IconName;
  kbd: string;
}

export type RouteId =
  | "overview"
  | "health-map"
  | "convergence"
  | "waste"
  | "rollbacks"
  | "alerts"
  | "settings"
  | "empty"
  | `loop:${string}`;

// Gain Margin retired 2026-06-05: oscillation margin measures a near-non-event
// on real loops (STALLING dominates, OSCILLATING ~0), and the "iterations past
// best / no static cap works" story replaced it on Convergence + Waste. The
// per-loop Aβ trajectory still lives in Loop Detail.
export const NAV: ReadonlyArray<NavItem> = [
  { id: "overview", label: "Overview", icon: "Activity", kbd: "g o" },
  { id: "health-map", label: "Loop Health Map", icon: "Map", kbd: "g h" },
  { id: "convergence", label: "Convergence", icon: "Trend", kbd: "g c" },
  { id: "waste", label: "Waste", icon: "Dollar", kbd: "g w" },
  { id: "rollbacks", label: "Rollbacks", icon: "Undo", kbd: "g r" },
  { id: "alerts", label: "Alerts", icon: "Bolt", kbd: "g a" },
];

export function isLoopRoute(r: string): r is `loop:${string}` {
  return r.startsWith("loop:");
}

export function loopRouteId(workloadId: string): `loop:${string}` {
  return `loop:${workloadId}`;
}

export function loopFromRoute(r: string): string | null {
  return r.startsWith("loop:") ? r.slice("loop:".length) : null;
}
