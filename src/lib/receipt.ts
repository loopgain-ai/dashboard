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
