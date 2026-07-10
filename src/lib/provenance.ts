// Provenance for displayed dollar figures — PURE module (no React, no
// API layer) so loopgain-verify can execute the real truth table
// (dash.demo_provenance_badges). The hook wrapper lives in api.ts.
//
// Every dollar figure on the dashboard is one of three things, and the
// badge next to it must say which (claim-provenance rule: a projection
// must never wear a measured badge):
//   measured     — paired-baseline delta the receiver actually carries
//                  (SUM(actual_dollars_saved/spent) over real runs)
//   projected    — demo mode: measured bench numbers × the visitor's
//                  fleet-scale and $/iter assumptions. Derived FROM
//                  measurements, but the displayed number is a projection.
//   extrapolated — no paired baseline: iteration counts × manual $/iter.

export type ProvenanceMode = "measured" | "projected" | "extrapolated";

export interface Provenance {
  mode: ProvenanceMode;
  badge: string;
  /** The "Cents-precision; not an extrapolation." sentence is only true
   *  for measured numbers. */
  showNotExtrapolation: boolean;
}

/** Demo mode always wins: its numbers are scaled/re-costed projections
 *  even though the underlying bench fields are measured. */
export function resolveProvenance(
  demo: boolean,
  hasActuals: boolean,
  costPerIter?: number,
): Provenance {
  if (demo) {
    return {
      mode: "projected",
      badge: "PROJECTED · FROM MEASURED BENCH",
      showNotExtrapolation: false,
    };
  }
  if (hasActuals) {
    return {
      mode: "measured",
      badge: "MEASURED · PAIRED BASELINE",
      showNotExtrapolation: true,
    };
  }
  return {
    mode: "extrapolated",
    badge:
      costPerIter != null
        ? `EXTRAPOLATED · $${costPerIter.toFixed(2)}/ITER`
        : "EXTRAPOLATED",
    showNotExtrapolation: false,
  };
}
