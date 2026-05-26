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
import { fmtUSD, fmtInt } from "../../lib/format";
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
  const counterfactual = (totals.total_iterations + totals.total_savings) * costPerIter;
  const actualSpend = totals.total_iterations * costPerIter;

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
  const series = useMemo(() => {
    if (events.length === 0) return [];
    const m = new Map<number, { saved: number; spent: number }>();
    const dayOf = (ts: number) => Math.floor(ts / 86400) * 86400;
    let minDay = Infinity;
    let maxDay = -Infinity;
    for (const e of events) {
      const day = dayOf(e.timestamp_hour);
      if (day < minDay) minDay = day;
      if (day > maxDay) maxDay = day;
      const saved = (e.savings_vs_fixed_cap ?? 0) * costPerIter;
      const spent = e.iterations_used * costPerIter;
      const slot = m.get(day);
      if (slot) {
        slot.saved += saved;
        slot.spent += spent;
      } else {
        m.set(day, { saved, spent });
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
  }, [events, costPerIter]);

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
              Extrapolated · would have spent
              <span
                className="mono"
                style={{
                  marginLeft: 8,
                  fontSize: 9.5,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: "var(--surf-3)",
                  color: "var(--text-3)",
                  letterSpacing: "0.04em",
                }}
              >
                ESTIMATE · ${costPerIter.toFixed(2)}/ITER
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
              {fmtUSD(counterfactual, { cents: false })}
            </div>
          </div>
          <div>
            <div className="label">Actual spend · extrapolated</div>
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
              {fmtUSD(actualSpend, { cents: false })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
              {fmtInt(totals.total_iterations)} iterations × $
              {costPerIter.toFixed(2)} per iter
            </div>
          </div>
        </div>
      </div>

      <div className="waste-breakdowns">
        {[
          {
            title: "By workload",
            rows: byWorkload,
            isOutcome: false,
            source: "extrapolated" as const,
          },
          {
            title: "By outcome",
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
            ? "Real paired-baseline dollars per outcome from /stats.aggregates.by_outcome."
            : "Extrapolated from savings_vs_fixed_cap × cost/iter across the events sample. Not the paired-baseline measurement.";
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
