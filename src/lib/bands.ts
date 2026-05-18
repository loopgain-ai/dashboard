// Aβ band semantics. The five-band partition of the loop-gain continuum,
// plus the adapter that turns a stored telemetry event into a band.

import type { Band, LoopEvent, Outcome, ProfileEvent } from "../types";

export interface BandDef {
  id: Band;
  label: string;
  short: string;
  cls: "fast" | "conv" | "stall" | "osc" | "div";
  range: [number, number];
}

export const BANDS: readonly BandDef[] = [
  { id: "FAST_CONVERGE", label: "Fast converge", short: "Fast",  cls: "fast",  range: [0, 0.3] },
  { id: "CONVERGING",    label: "Converging",    short: "Conv",  cls: "conv",  range: [0.3, 0.85] },
  { id: "STALLING",      label: "Stalling",      short: "Stall", cls: "stall", range: [0.85, 0.95] },
  { id: "OSCILLATING",   label: "Oscillating",   short: "Osc",   cls: "osc",   range: [0.95, 1.05] },
  { id: "DIVERGING",     label: "Diverging",     short: "Div",   cls: "div",   range: [1.05, Infinity] },
];

export const BAND_BY_ID: Record<Band, BandDef> = Object.fromEntries(
  BANDS.map((b) => [b.id, b]),
) as Record<Band, BandDef>;

export const BAND_COLOR: Record<Band, string> = {
  FAST_CONVERGE: "var(--band-fast)",
  CONVERGING:    "var(--band-conv)",
  STALLING:      "var(--band-stall)",
  OSCILLATING:   "var(--band-osc)",
  DIVERGING:     "var(--band-div)",
};

/** Classify a raw Aβ value into a band. */
export function bandFromAB(ab: number): Band {
  if (ab < 0.3) return "FAST_CONVERGE";
  if (ab < 0.85) return "CONVERGING";
  if (ab < 0.95) return "STALLING";
  if (ab < 1.05) return "OSCILLATING";
  return "DIVERGING";
}

/**
 * Map a telemetry event to a band.
 *
 * The receiver stores outcome strings; the dashboard needs band classifications.
 * A `converged` outcome with `profile_max >= 0.85` is really stalling territory
 * (it crossed the warning band before reaching target). `max_iterations` means
 * the run never converged or diverged — same shape as STALLING.
 */
export function bandFromEvent(
  e: Pick<LoopEvent, "outcome" | "profile_max"> & { profile_median?: number | null },
): Band {
  switch (e.outcome) {
    case "converged":
      if (e.profile_max != null && e.profile_max >= 0.85) return "STALLING";
      if (e.profile_median != null && e.profile_median < 0.3) return "FAST_CONVERGE";
      return "CONVERGING";
    case "oscillating":
      return "OSCILLATING";
    case "diverged":
      return "DIVERGING";
    case "stalled":
      return "STALLING";
    case "max_iterations":
      return "STALLING";
    default:
      return "CONVERGING";
  }
}

/** Same logic but accepts the richer ProfileEvent shape (includes median). */
export function bandFromProfileEvent(e: ProfileEvent): Band {
  return bandFromEvent({
    outcome: e.outcome,
    profile_max: e.profile_max,
    profile_median: e.profile_median,
  });
}

/** Human-readable label for an outcome string. */
export function outcomeLabel(o: Outcome): string {
  switch (o) {
    case "converged": return "converged";
    case "oscillating": return "oscillating";
    case "diverged": return "diverged";
    case "stalled": return "stalled";
    case "max_iterations": return "max iter";
    default: return String(o);
  }
}
