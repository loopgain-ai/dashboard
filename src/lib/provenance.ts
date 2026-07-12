// Provenance for displayed dollar figures — PURE module (no React, no
// API layer) so loopgain-verify can execute the real truth table
// (dash.demo_provenance_badges). The hook wrapper lives in api.ts.
//
// Every dollar figure on the dashboard is one of two things, and the
// badge next to it must say which (claim-provenance rule: an estimate
// must never wear a measured badge):
//   measured     — paired-baseline delta the receiver actually carries
//                  (SUM(actual_dollars_saved/spent) over real runs). In
//                  demo mode these are the recorded benchmark run's own
//                  measured dollars, truncated to the replay's position
//                  — never scaled or re-costed — so the badge names the
//                  source: the recorded bench run.
//   extrapolated — no paired baseline: iteration counts × manual $/iter.
//
// (The former "projected" mode — measured bench × visitor-chosen fleet
// scale and $/iter — was retired 2026-07-10 with the checkpoint-replay
// demo: /demo now shows only true recorded state.)

export type ProvenanceMode = "measured" | "mixed" | "extrapolated";

export interface Provenance {
  mode: ProvenanceMode;
  badge: string;
  /** The "Cents-precision; not an extrapolation." sentence is only true
   *  for measured numbers. */
  showNotExtrapolation: boolean;
}

export function resolveProvenance(
  demo: boolean,
  hasActuals: boolean,
  costPerIter?: number,
  /** Partial-coverage actuals (some runs carry measured dollars, some
   *  don't — see receipt.ts spendBreakdown). The badge names the split;
   *  a partially-measured number must wear neither a pure MEASURED nor
   *  a pure EXTRAPOLATED badge. */
  mixed?: { measuredRuns: number; totalRuns: number },
): Provenance {
  if (mixed) {
    return {
      mode: "mixed",
      badge: `MIXED · ${mixed.measuredRuns.toLocaleString()} OF ${mixed.totalRuns.toLocaleString()} RUNS MEASURED`,
      showNotExtrapolation: false,
    };
  }
  if (hasActuals) {
    return {
      mode: "measured",
      badge: demo ? "MEASURED · RECORDED BENCH RUN" : "MEASURED · PAIRED BASELINE",
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
