// Small-fleet receipt framing — PURE module so loopgain-verify can pin
// the arithmetic (dash.small_fleet_pct).
//
// A tenant with 2,000 Haiku-scale runs sees "$25.11 saved" as their
// 30-day hero — honest, but as a first impression it reads as "not worth
// $199/mo". The percentage tells the same measurement's real story:
// LoopGain eliminated 92.8% of what those loops would have spent. Lead
// with the %, keep the measured $ as the supporting line, ONLY when both
// sides of the ratio are measured (paired baseline) — a percentage built
// on extrapolated inputs would be a projection wearing a measured frame.

/** Share of the would-have-spent total that LoopGain eliminated:
 *  saved / (saved + actualSpend). The denominator is the counterfactual
 *  (what the fleet would have spent with no LoopGain in the loop) for
 *  paired-baseline tenants — see Waste.tsx's `counterfactual`.
 *  Returns null when the inputs can't support the claim. */
export function spendEliminatedPct(
  saved: number,
  actualSpend: number,
): number | null {
  if (!Number.isFinite(saved) || !Number.isFinite(actualSpend)) return null;
  if (saved <= 0 || actualSpend < 0) return null;
  const counterfactual = saved + actualSpend;
  if (counterfactual <= 0) return null;
  return saved / counterfactual;
}

/** Small-fleet threshold: below this measured-savings level the absolute
 *  dollar number undersells the measurement and the % leads. */
export const SMALL_FLEET_SAVED_USD = 500;

/** True when the hero should lead with the eliminated-% instead of $. */
export function leadWithPct(measured: boolean, saved: number): boolean {
  return measured && Number.isFinite(saved) && saved > 0 && saved < SMALL_FLEET_SAVED_USD;
}

// ── Spend breakdown (coverage-aware) ─────────────────────────────────
//
// A tenant where only SOME runs carry measured actual_dollars_spent must
// not have that partial sum presented as fleet-wide spend (seen live
// 2026-07-12: "$13.80 actual spend" from 6 of 1,882 runs, next to an
// extrapolated fleet-wide counterfactual). Policy, per Dave: show real
// dollars wherever the sender passed them, extrapolate at $/iter ONLY
// for the uncovered remainder, and disclose the split.

export interface SpendBreakdown {
  /** measured  — every run carries measured dollars; spend is their sum.
   *  mixed     — some runs measured: spend = measured Σ + uncovered
   *              iterations × $/iter.
   *  extrapolated — no measured dollars at all. */
  mode: "measured" | "mixed" | "extrapolated";
  /** The hero number: measured dollars + extrapolated remainder. */
  spend: number;
  measuredDollars: number;
  measuredRuns: number;
  totalRuns: number;
  /** Iterations NOT covered by measured dollars (valued at $/iter). */
  uncoveredIterations: number;
}

export function spendBreakdown(
  t: {
    event_count: number;
    total_iterations: number;
    total_actual_dollars_spent?: number | null;
    event_count_with_actual_spend?: number;
    total_iterations_with_actual_spend?: number;
  },
  costPerIter: number,
): SpendBreakdown {
  const measuredDollars =
    typeof t.total_actual_dollars_spent === "number" &&
    Number.isFinite(t.total_actual_dollars_spent)
      ? t.total_actual_dollars_spent
      : 0;
  const measuredRuns = t.event_count_with_actual_spend ?? 0;
  const base = {
    measuredDollars,
    measuredRuns,
    totalRuns: t.event_count,
  };
  if (measuredRuns <= 0) {
    return {
      ...base,
      mode: "extrapolated",
      spend: t.total_iterations * costPerIter,
      uncoveredIterations: t.total_iterations,
    };
  }
  if (measuredRuns >= t.event_count) {
    return { ...base, mode: "measured", spend: measuredDollars, uncoveredIterations: 0 };
  }
  // Partial coverage. Older receivers don't serve
  // total_iterations_with_actual_spend; without it the uncovered share
  // can't be valued, so degrade to the pre-2026-07-12 behavior (treat
  // the measured sum as the spend) rather than invent a number.
  if (typeof t.total_iterations_with_actual_spend !== "number") {
    return { ...base, mode: "measured", spend: measuredDollars, uncoveredIterations: 0 };
  }
  const uncovered = Math.max(
    0,
    t.total_iterations - t.total_iterations_with_actual_spend,
  );
  return {
    ...base,
    mode: "mixed",
    spend: measuredDollars + uncovered * costPerIter,
    uncoveredIterations: uncovered,
  };
}
