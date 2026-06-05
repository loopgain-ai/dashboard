// Panel 3 — Waste Report (the ROI panel).
//
// Hero number: total_savings * costPerIter from /v1/stats.
// Counterfactual: total_iterations * costPerIter (assumed fixed-cap baseline).
// Breakdown: by workload_id, from events.
// Time series: events grouped by day.

import { useMemo } from "react";
import { useEvents, useStats } from "../../lib/data-hooks";
import { Chip, Icon, PanelHeader } from "../primitives";
import { AreaChart, HBar } from "../charts";
import { Loaded } from "./PanelState";
import { fmtUSD, fmtInt, fmtPct } from "../../lib/format";
import { BENCH_OVERRUN, FIXED_CAP_BASELINE, iterationWasteFleet } from "../../lib/iteration-waste";
import type { LoopEvent, StatsResponse } from "../../types";

const OUTCOME_COLOR: Record<string, string> = {
  converged: "var(--band-conv)",
  diverged: "var(--band-div)",
  oscillating: "var(--band-osc)",
  max_iterations: "var(--band-stall)",
};

interface Props {
  costPerIter: number;
  setCostPerIter: (n: number) => void;
  pollMs?: number;
  sinceHours?: number;
}

export function Waste({ costPerIter, setCostPerIter, pollMs, sinceHours }: Props) {
  const stats = useStats({ pollMs });
  const events = useEvents({ pollMs, sinceHours });
  return (
    <div style={{ padding: 24 }}>
      <Loaded state={stats.state}>
        {(statsData) => (
          <Loaded state={events.state}>
            {(eventsData) => (
              <WasteBody
                stats={statsData}
                events={eventsData.events}
                costPerIter={costPerIter}
                setCostPerIter={setCostPerIter}
              />
            )}
          </Loaded>
        )}
      </Loaded>
    </div>
  );
}

function WasteBody({
  stats,
  events,
  costPerIter,
  setCostPerIter,
}: {
  stats: StatsResponse;
  events: ReadonlyArray<LoopEvent>;
  costPerIter: number;
  setCostPerIter: (n: number) => void;
}) {
  const totals = stats.totals ?? {
    event_count: 0,
    total_iterations: 0,
    total_savings: 0,
    rollbacks: 0,
  };
  // Match the Overview Spotlight: prefer the receiver's real paired-baseline
  // SUM(actual_dollars_saved) when available (currently: bench tenant);
  // fall back to iters × $/iter extrapolation otherwise. Counterfactual /
  // breakdown series stay on the extrapolation path because they need
  // per-event resolution and the event payload has savings_vs_fixed_cap,
  // not per-event actual dollars.
  const hasActualSavings =
    typeof totals.total_actual_dollars_saved === "number" &&
    Number.isFinite(totals.total_actual_dollars_saved);
  const saved = hasActualSavings
    ? (totals.total_actual_dollars_saved as number)
    : totals.total_savings * costPerIter;
  // actualSpend prefers measured data when the receiver exposes it
  // (receiver v0.3.2+, currently populated by the bench tenant via
  // paired cost_usd.LG per trial). Falls back to iter-count × $/iter
  // extrapolation when measured spend is unavailable. Same shape as
  // hasActualSavings above — this replaces a 2026-05-25 bench-tenant
  // string-match hack with a flag driven by data the receiver carries.
  const hasActualSpend =
    typeof totals.total_actual_dollars_spent === "number" &&
    Number.isFinite(totals.total_actual_dollars_spent);
  const actualSpend = hasActualSpend
    ? (totals.total_actual_dollars_spent as number)
    : totals.total_iterations * costPerIter;
  // Counterfactual = what the user would have spent with no LoopGain in
  // the loop. Three flavors of "would have spent" exist:
  //   - measured + measured (paired-baseline tenants with cost data on
  //     every event): saved $ is the paired delta, actual spend is the
  //     real LG cost; counterfactual is their sum. Cents-precision.
  //   - measured + extrapolated (paired savings, no per-event spend):
  //     saved is real, spend is iter × $/iter, counterfactual = sum.
  //   - pure extrapolation (no paired baseline): treat every avoided
  //     iteration as if it would have run at $/iter — counterfactual
  //     = (used + avoided) × $/iter.
  const counterfactual = hasActualSavings
    ? saved + actualSpend
    : (totals.total_iterations + totals.total_savings) * costPerIter;

  // Iterations-past-best section. Fleet aggregates come from the receiver's
  // served best_index columns (proven == raw by loopgain-verify
  // `dash.live_iteration_waste`); display math is the shared pure module.
  const hasBestIndex =
    typeof totals.event_count_with_best_index === "number" &&
    totals.event_count_with_best_index > 0;
  const iw = hasBestIndex
    ? iterationWasteFleet({
        event_count_with_best_index: totals.event_count_with_best_index!,
        event_count_best_at_iter1: totals.event_count_best_at_iter1 ?? 0,
        total_iterations_past_best: totals.total_iterations_past_best ?? 0,
        total_savings: totals.total_savings,
      })
    : null;
  // Value the wasted iterations. The eliminated grind (in iterations) exactly
  // equals total_savings, so on a measured tenant its dollar value is the very
  // same `saved` hero number — we derive a per-iteration rate from that pair so
  // the fixed-cap / residual figures stay on the same (measured) footing.
  // Falls back to the manual cost/iter when no measured savings exist.
  const dollarsPerIterEff =
    hasActualSavings && totals.total_savings > 0
      ? saved / totals.total_savings
      : costPerIter;

  // Breakdown by workload_id from events
  const byWorkload = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      if (e.workload_id && e.savings_vs_fixed_cap != null && e.savings_vs_fixed_cap > 0) {
        const dollars = e.savings_vs_fixed_cap * costPerIter;
        m.set(e.workload_id, (m.get(e.workload_id) ?? 0) + dollars);
      }
    }
    return Array.from(m)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [events, costPerIter]);

  // By outcome — prefer the receiver's fleet-wide aggregate
  // (v0.3.1+) which carries real `actual_dollars_saved` per
  // outcome. Falls back to extrapolating from the events sample
  // for older receivers. Returned shape distinguishes which path
  // we took so the breakdown panel can label itself honestly.
  const byOutcome = useMemo<{
    rows: Array<{ label: string; value: number }>;
    source: "measured" | "extrapolated";
  }>(() => {
    const agg = stats.aggregates?.by_outcome;
    const hasMeasured =
      agg &&
      agg.length > 0 &&
      agg.every(
        (r) =>
          typeof r.actual_dollars_saved === "number" &&
          Number.isFinite(r.actual_dollars_saved),
      );
    if (hasMeasured) {
      const rows = agg
        .map((r) => ({
          label: r.outcome,
          value: r.actual_dollars_saved as number,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value);
      return { rows, source: "measured" };
    }
    const m = new Map<string, number>();
    for (const e of events) {
      if (e.savings_vs_fixed_cap != null && e.savings_vs_fixed_cap > 0) {
        const dollars = e.savings_vs_fixed_cap * costPerIter;
        m.set(e.outcome, (m.get(e.outcome) ?? 0) + dollars);
      }
    }
    const rows = Array.from(m)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    return { rows, source: "extrapolated" };
  }, [events, costPerIter, stats.aggregates?.by_outcome]);

  // Daily time series — bucket events into days, compute saved + would-have-spent.
  //
  // Pre-fix the saved layer used (savings_vs_fixed_cap × $/iter) per
  // event, which on a paired-baseline tenant overstates daily savings
  // by ~100× vs. the measured headline. Now we scale each event's
  // contribution by (measured_total / extrapolated_total) so the daily
  // saved values integrate to the headline $25.81 while preserving
  // when the events actually happened. Non-paired tenants fall back to
  // the pure extrapolation since they have no measured anchor.
  const series = useMemo(() => {
    if (events.length === 0) return [];
    const extrapolatedSavedTotal = totals.total_savings * costPerIter;
    const savedScale =
      hasActualSavings && extrapolatedSavedTotal > 0
        ? saved / extrapolatedSavedTotal
        : 1;
    // Same scaling trick for the spend layer when the receiver carries
    // measured spend (v0.3.2+). Per-event spend is still extrapolated
    // from iter-count because actual_dollars_spent isn't joined onto
    // /v1/events yet; we scale it so the daily layer integrates to the
    // measured headline. Falls back to no-op when only extrapolated
    // spend is available.
    const extrapolatedSpentTotal = totals.total_iterations * costPerIter;
    const spentScale =
      hasActualSpend && extrapolatedSpentTotal > 0
        ? actualSpend / extrapolatedSpentTotal
        : 1;
    const m = new Map<number, { saved: number; spent: number }>();
    const dayOf = (ts: number) => Math.floor(ts / 86400) * 86400;
    let minDay = Infinity;
    let maxDay = -Infinity;
    for (const e of events) {
      const day = dayOf(e.timestamp_hour);
      if (day < minDay) minDay = day;
      if (day > maxDay) maxDay = day;
      const eventSaved = (e.savings_vs_fixed_cap ?? 0) * costPerIter * savedScale;
      const eventSpent = e.iterations_used * costPerIter * spentScale;
      const slot = m.get(day);
      if (slot) {
        slot.saved += eventSaved;
        slot.spent += eventSpent;
      } else {
        m.set(day, { saved: eventSaved, spent: eventSpent });
      }
    }
    const out: Array<{ ts: number; saved: number; spent: number; counterfactual: number }> = [];
    for (let day = minDay; day <= maxDay; day += 86400) {
      const slot = m.get(day) ?? { saved: 0, spent: 0 };
      out.push({
        ts: day,
        saved: slot.saved,
        spent: slot.spent,
        counterfactual: slot.spent + slot.saved,
      });
    }
    return out;
  }, [
    events,
    costPerIter,
    hasActualSavings,
    saved,
    totals.total_savings,
    totals.total_iterations,
    hasActualSpend,
    actualSpend,
  ]);

  function fmtTick(i: number, n: number): string {
    const p = series[i];
    if (!p) return "";
    const d = new Date(p.ts * 1000);
    const days = (series[n - 1]!.ts - series[0]!.ts) / 86400;
    if (days > 7) return `${d.getMonth() + 1}/${d.getDate()}`;
    return d.toLocaleString(undefined, { weekday: "short" });
  }

  return (
    <>
      <PanelHeader
        title="Waste Report"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--surf-2)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "0 8px",
                height: 24,
              }}
            >
              <span className="label">cost/iter $</span>
              <input
                type="number"
                value={costPerIter}
                step="0.01"
                min="0"
                onChange={(e) => setCostPerIter(Number(e.target.value) || 0)}
                style={{
                  width: 60,
                  height: 22,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: 11.5,
                  fontFamily: "var(--mono)",
                  color: "var(--text-1)",
                  textAlign: "right",
                }}
              />
            </label>
            <Chip icon={<Icon.Download />}>Export</Chip>
          </div>
        }
      />

      <div className="card waste-hero" style={{ padding: 28 }}>
        <div>
          <div className="label">
            Saved by LoopGain · 30d
            {hasActualSavings && (
              <span
                className="mono"
                style={{
                  marginLeft: 10,
                  fontSize: 9.5,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: "color-mix(in oklab, var(--band-fast) 18%, transparent)",
                  color: "var(--band-fast)",
                  letterSpacing: "0.04em",
                }}
              >
                MEASURED · PAIRED BASELINE
              </span>
            )}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 84,
              fontWeight: 500,
              letterSpacing: "-0.04em",
              color: "var(--band-fast)",
              lineHeight: 1,
              marginTop: 8,
            }}
          >
            {fmtUSD(saved, { cents: hasActualSavings })}
          </div>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 12,
            }}
          >
            <span
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                borderRadius: 4,
                background: "color-mix(in oklab, var(--band-conv) 12%, transparent)",
                color: "var(--band-conv)",
                fontSize: 11,
              }}
            >
              {fmtInt(totals.total_savings)} iterations avoided
            </span>
            <span style={{ color: "var(--text-3)" }}>
              {fmtInt(totals.rollbacks)} rollbacks executed in window
            </span>
          </div>
          {hasActualSavings && (
            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "var(--text-3)",
                maxWidth: 460,
                lineHeight: 1.45,
              }}
            >
              Real cost delta vs. matched no-LoopGain runs of the same workload.
              Cents-precision; not an extrapolation.
            </div>
          )}
        </div>

        <div
          className="waste-hero-right"
          style={{
            borderLeft: "1px solid var(--border)",
            paddingLeft: 32,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <div>
            <div className="label">
              Would have spent
              <span
                className="mono"
                style={{
                  marginLeft: 10,
                  fontSize: 9.5,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: hasActualSpend
                    ? "color-mix(in oklab, var(--band-fast) 18%, transparent)"
                    : "var(--surf-3)",
                  color: hasActualSpend ? "var(--band-fast)" : "var(--text-3)",
                  letterSpacing: "0.04em",
                }}
              >
                {hasActualSpend
                  ? "MEASURED · PAIRED BASELINE"
                  : `EXTRAPOLATED · $${costPerIter.toFixed(2)}/ITER`}
              </span>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 38,
                fontWeight: 500,
                color: "var(--text-3)",
                letterSpacing: "-0.02em",
                textDecoration: "line-through",
                textDecorationColor: "var(--text-4)",
                marginTop: 6,
              }}
            >
              {fmtUSD(counterfactual, { cents: hasActualSpend })}
            </div>
          </div>
          <div>
            <div className="label">
              Actual spend
              <span
                className="mono"
                style={{
                  marginLeft: 10,
                  fontSize: 9.5,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: hasActualSpend
                    ? "color-mix(in oklab, var(--band-fast) 18%, transparent)"
                    : "var(--surf-3)",
                  color: hasActualSpend ? "var(--band-fast)" : "var(--text-3)",
                  letterSpacing: "0.04em",
                }}
              >
                {hasActualSpend
                  ? "MEASURED · PAIRED BASELINE"
                  : `EXTRAPOLATED · $${costPerIter.toFixed(2)}/ITER`}
              </span>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 28,
                fontWeight: 500,
                color: "var(--text-1)",
                letterSpacing: "-0.02em",
                marginTop: 4,
              }}
            >
              {fmtUSD(actualSpend, { cents: hasActualSpend })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
              {hasActualSpend
                ? `${fmtInt(totals.total_iterations)} iterations · real per-trial cost`
                : `${fmtInt(totals.total_iterations)} iterations × $${costPerIter.toFixed(2)} per iter`}
            </div>
          </div>
        </div>
      </div>

      {iw && (
        <div className="card" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
          <div className="card-h">
            <h3>Iterations past best</h3>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
              best_index · {fmtInt(iw.withBestIndex)} loops
            </span>
          </div>
          <div
            style={{ fontSize: 11.5, color: "var(--text-3)", padding: "10px 16px 0", lineHeight: 1.5, maxWidth: 880 }}
          >
            Iterations a loop runs <em>after</em> its best output — and they don&apos;t just waste
            money. On{" "}
            <span style={{ color: "var(--text-1)" }}>{fmtPct(BENCH_OVERRUN.degradedFraction)}</span>{" "}
            of these loops the final answer is <em>measurably worse</em> than the best (median{" "}
            <span style={{ color: "var(--text-1)" }}>{BENCH_OVERRUN.degradedMedianX}×</span> the error).
            A fixed <span className="mono">max_iter={FIXED_CAP_BASELINE}</span> cap ships that degraded
            answer; LoopGain rolls back to the best.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", padding: 16, gap: 0 }}>
            {[
              {
                tone: "var(--band-stall)",
                label: `Fixed cap · max_iter=${FIXED_CAP_BASELINE}`,
                iters: iw.fixedCapGrindTotal,
                sub: "would grind past best",
              },
              {
                tone: "var(--band-conv)",
                label: "LoopGain · residual",
                iters: iw.lgGrindTotal,
                sub: "ran past best, then rolled back to it",
              },
              {
                tone: "var(--band-fast)",
                label: "Eliminated",
                iters: iw.grindEliminated,
                sub: `${fmtPct(iw.grindEliminatedPct)} of the grind`,
                strong: true,
              },
            ].map((c, i) => (
              <div
                key={i}
                style={{ padding: "4px 18px", borderLeft: i === 0 ? "none" : "1px solid var(--border)" }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: c.tone,
                    marginBottom: 8,
                  }}
                >
                  {c.label}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 30,
                    fontWeight: 500,
                    color: c.strong ? c.tone : "var(--text-1)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {fmtUSD(c.iters * dollarsPerIterEff, { cents: hasActualSavings })}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                  {fmtInt(c.iters)} iterations · {c.sub}
                </div>
              </div>
            ))}
          </div>

          {/* What the overrun costs in QUALITY, not just money. The error
              trajectory (final-vs-best) is bench-only — the receiver carries
              best_index but not error_history — so this is a labeled benchmark
              receipt, pinned by loopgain-verify thesis.degrades_past_best +
              dash.ts_overrun_degrade_consts, not a per-tenant live number. */}
          <div style={{ padding: "4px 18px 20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 8,
              }}
            >
              <div className="label">It&apos;s not just wasted — it&apos;s worse</div>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
                final vs. best error · measured on the LoopGain benchmark
              </span>
            </div>
            <div
              style={{
                display: "flex",
                height: 14,
                borderRadius: 3,
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: `${BENCH_OVERRUN.degradedFraction * 100}%`,
                  background: "var(--band-div)",
                  opacity: 0.85,
                }}
                title={`${fmtPct(BENCH_OVERRUN.degradedFraction)} of loops that overran ended up worse`}
              />
              <div
                style={{
                  width: `${(1 - BENCH_OVERRUN.degradedFraction) * 100}%`,
                  background: "var(--surf-3)",
                }}
                title="plateaued — final equals best"
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
                fontSize: 11,
                color: "var(--text-3)",
                lineHeight: 1.4,
              }}
            >
              <span>
                <span className="mono" style={{ color: "var(--band-div)" }}>
                  {fmtPct(BENCH_OVERRUN.degradedFraction)}
                </span>{" "}
                ended up worse than best — median{" "}
                <span style={{ color: "var(--text-1)" }}>{BENCH_OVERRUN.degradedMedianX}×</span>{" "}
                the error, up to{" "}
                <span style={{ color: "var(--text-1)" }}>{BENCH_OVERRUN.degradedMaxX}×</span>
              </span>
              <span>
                <span className="mono">{fmtPct(1 - BENCH_OVERRUN.degradedFraction)}</span> plateaued
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="waste-breakdowns">
        {[
          {
            title: "Saved · by workload",
            rows: byWorkload,
            isOutcome: false,
            source: "extrapolated" as const,
          },
          {
            title: "Saved · by outcome",
            rows: byOutcome.rows,
            isOutcome: true,
            source: byOutcome.source,
          },
        ].map((b) => {
          const isMeasured = b.source === "measured";
          const tagBg = isMeasured
            ? "color-mix(in oklab, var(--band-fast) 18%, transparent)"
            : "var(--surf-3)";
          const tagColor = isMeasured ? "var(--band-fast)" : "var(--text-3)";
          const tagTitle = isMeasured
            ? "Real dollars saved by LoopGain per outcome — paired-baseline measurement from /stats.aggregates.by_outcome. Not the without-LoopGain cost; it's the delta vs. matched no-LoopGain runs."
            : "Dollars saved by LoopGain, extrapolated from savings_vs_fixed_cap × cost/iter across the events sample. Not a paired-baseline measurement, and not the without-LoopGain cost — it's the savings delta.";
          return (
            <div key={b.title} className="card">
              <div className="card-h">
                <h3>{b.title}</h3>
                <span
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: tagBg,
                    color: tagColor,
                    letterSpacing: "0.04em",
                  }}
                  title={tagTitle}
                >
                  {b.source} · {b.rows.length} rows
                </span>
              </div>
              <div style={{ padding: 14 }}>
                <HBar
                  rows={b.rows.slice(0, 10).map((r) => ({
                    label: r.label,
                    value: r.value,
                    color: b.isOutcome ? OUTCOME_COLOR[r.label] ?? "var(--accent)" : "var(--accent)",
                  }))}
                  valueFmt={(v) => fmtUSD(v, { cents: isMeasured })}
                />
              </div>
            </div>
          );
        })}
      </div>

      {series.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 8,
            }}
          >
            <div>
              <div className="label">Spend · over time</div>
              <div
                className="mono"
                style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}
              >
                {series.length} {series.length === 1 ? "day" : "days"} · actual spend (lower) + savings layer
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 8, background: "var(--accent)", opacity: 0.4 }} />
                <span className="mono" style={{ color: "var(--text-2)" }}>
                  actual spend
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 8, background: "var(--band-fast)", opacity: 0.4 }} />
                <span className="mono" style={{ color: "var(--text-2)" }}>
                  saved
                </span>
              </div>
            </div>
          </div>
          <AreaChart
            data={series}
            width={1100}
            height={220}
            fields={["spent", "saved"]}
            colors={["var(--accent)", "var(--band-fast)"]}
            xLabel={fmtTick}
            yPrefix="$"
          />
        </div>
      )}
    </>
  );
}
