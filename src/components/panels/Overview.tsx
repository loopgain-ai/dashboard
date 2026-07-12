// Overview — fleet health at a glance, computed from real /v1/stats + /v1/events.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useEventDetail, useEvents, useStats } from "../../lib/data-hooks";
import { bandFromEvent } from "../../lib/bands";
import { fmtRel, fmtTime, fmtUSD, fmtInt, fmtCompact, fmtPct } from "../../lib/format";
import { iterationWasteFleet } from "../../lib/iteration-waste";
// Hardcoded fixed-cap baseline used in the "Iterations · 30d" tile. Matches
// `max_iter=20` from the bench protocol; for paying-customer fleet view this
// should be sourced from tenant config when that view ships.
const FIXED_CAP_BASELINE = 20;
import { Chip, Icon, KPI, PanelHeader, StatePill } from "../primitives";
import { OutcomeDistGauge, Sparkline, TrajectoryChart } from "../charts";
import { Loaded } from "./PanelState";
import { loopRouteId } from "../shell/routes";
import type { RouteId, TimeRange } from "../shell";
import { useAuth, useProvenance, useWindowSuffix, type LoadState } from "../../lib/api";
import { leadWithPct, spendEliminatedPct } from "../../lib/receipt";
import { useDemoReplay, type ReplayLatest } from "../../lib/demo-replay";
import { matchesFilters, savingsAccrual } from "../../lib/replay-core";
import { useFilters } from "../../lib/filters";
import type { EventDetailResponse, LoopEvent, Outcome, StatsResponse } from "../../types";

// Visual mapping for the outcome strip. Drives the five-pill row in the
// Aβ-gauge card. Outcomes come from /v1/stats.outcomes (server-side counts
// across every event in window) so the strip reflects tenant-wide reality
// rather than the recency-biased /events sample. We reuse the band-color
// palette since each outcome has a natural band analogue:
//   converged      → CONV (green)
//   stalled        → STALL (yellow)
//   max_iterations → STALL (never reached target)
//   oscillating    → OSC (red)
//   diverged       → DIV (dark red)
// Cells with zero count are hidden — a healthy tenant won't see DIV/OSC
// pills at all, and the bench won't see a FAST cell that doesn't apply.
interface OutcomeCell {
  key: string;
  short: string;
  cls: "fast" | "conv" | "stall" | "osc" | "div";
  colorVar: string;
  matches: ReadonlyArray<Outcome>;
}
// Order is worst→best so the gauge arc reads left-to-right as
// DIV → OSC → STALL → CONV (matching control-theory convention: bad
// outcomes on the left, healthy on the right). The strip below the
// gauge renders in this same order, so a viewer scanning across the
// strip is traversing the same outcome severity axis as the arc.
const OUTCOME_CELLS: ReadonlyArray<OutcomeCell> = [
  {
    key: "diverged",
    short: "DIV",
    cls: "div",
    colorVar: "var(--band-div)",
    matches: ["diverged"],
  },
  {
    key: "oscillating",
    short: "OSC",
    cls: "osc",
    colorVar: "var(--band-osc)",
    matches: ["oscillating"],
  },
  {
    key: "stalled",
    short: "STALL",
    cls: "stall",
    colorVar: "var(--band-stall)",
    matches: ["stalled", "max_iterations"],
  },
  {
    key: "converged",
    short: "CONV",
    cls: "conv",
    colorVar: "var(--band-conv)",
    matches: ["converged"],
  },
];

interface Props {
  setRoute: (r: RouteId) => void;
  costPerIter: number;
  includeCalibration?: boolean;
  pollMs?: number;
  sinceHours?: number;
  timeRange: TimeRange;
}

export function Overview({
  setRoute,
  costPerIter,
  includeCalibration,
  pollMs,
  sinceHours,
  timeRange,
}: Props) {
  const stats = useStats({ pollMs, includeCalibration });
  const events = useEvents({ pollMs, sinceHours, includeCalibration });
  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <Loaded state={events.state}>
        {(eventsData, isStale) => (
          <Loaded state={stats.state}>
            {(statsData) => (
              <OverviewBody
                stats={statsData}
                events={eventsData.events}
                setRoute={setRoute}
                costPerIter={costPerIter}
                isStale={isStale}
                timeRange={timeRange}
              />
            )}
          </Loaded>
        )}
      </Loaded>
    </div>
  );
}

function OverviewBody({
  stats,
  events,
  setRoute,
  costPerIter,
  isStale,
  timeRange,
}: {
  stats: StatsResponse;
  events: ReadonlyArray<LoopEvent>;
  setRoute: (r: RouteId) => void;
  costPerIter: number;
  isStale: boolean;
  timeRange: TimeRange;
}) {
  const { demo, bench } = useAuth();
  // Bench/demo read the static benchmark dataset all-time (the receiver's
  // public routes force sinceEpoch=0), so the "Fleet · 30d" eyebrow would
  // mislabel the window there. Demo names the replay explicitly.
  const windowLabel = demo
    ? "recorded benchmark run · live replay"
    : bench
    ? "bench dataset · all-time"
    : timeRange;
  const windowSuffix = useWindowSuffix();
  // Live replay (demo only): the recorded benchmark run playing back from
  // a checkpoint, ~1 run/second. In demo the `stats` and `events` props
  // are ALREADY truncated to the replay's position (see data-hooks +
  // replay-core), so every figure below moves on its own as runs land —
  // no session bookkeeping here.
  const replay = useDemoReplay();
  // Outcome counts come straight from /v1/stats.outcomes — tenant-wide,
  // not sample-biased. Outcomes are the terminal state recorded by the
  // library; the receiver SUMs them on every event in window.
  const outcomeCounts = useMemo<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    for (const row of stats.outcomes) c[row.outcome] = row.count;
    return c;
  }, [stats.outcomes]);
  const totalEvents = stats.totals?.event_count ?? events.length;
  // % CONVERGED — single-scalar fleet-health signal feeding the RingGauge
  // on the left card. Sourced from /v1/stats.outcomes server-side counts
  // (not the recency-biased /events sample), so the gauge reflects
  // tenant-wide reality. Bench reads 1302 / 2000 = 65.1%.
  const convCount = outcomeCounts["converged"] ?? 0;
  const convergenceRate = totalEvents > 0 ? (convCount / totalEvents) * 100 : 0;
  // Cells with non-zero matching outcomes; render this set so a healthy
  // tenant doesn't see five zeros next to one number.
  const visibleCells = useMemo(
    () =>
      OUTCOME_CELLS.map((cell) => {
        const count = cell.matches.reduce(
          (s, k) => s + (outcomeCounts[k] ?? 0),
          0,
        );
        return { ...cell, count };
      }).filter((cell) => cell.count > 0),
    [outcomeCounts],
  );
  // Attention = oscillating + diverged. Mirrors the old DIV+OSC band sum but
  // now sourced from server-side outcome counts.
  const attentionCount =
    (outcomeCounts["oscillating"] ?? 0) + (outcomeCounts["diverged"] ?? 0);
  const hasDiverged = (outcomeCounts["diverged"] ?? 0) > 0;
  const totals: NonNullable<StatsResponse["totals"]> = stats.totals ?? {
    event_count: 0,
    total_iterations: 0,
    total_savings: 0,
    rollbacks: 0,
  };
  // Prefer the receiver's SUM(actual_dollars_saved) when present — that's
  // the tenant's real, measured paired-baseline delta (bench has this from
  // running every workload under B20 and LG). For tenants without paired
  // data, fall back to iter-count × $/iter extrapolation. The bench's old
  // ~$835 number was the extrapolation; the real measured savings is
  // ~$25.81 — without this branch the dashboard contradicts the landing.
  const hasActualSavings =
    typeof totals.total_actual_dollars_saved === "number" &&
    Number.isFinite(totals.total_actual_dollars_saved);
  const savedDollars = hasActualSavings
    ? (totals.total_actual_dollars_saved as number)
    : totals.total_savings * costPerIter;
  // Demo mode = projection; the measured badge must not imply otherwise.
  const savedProv = useProvenance(hasActualSavings, costPerIter);
  // Small measured fleets lead with the eliminated-% (see lib/receipt.ts;
  // pinned by dash.small_fleet_pct). Needs measured spend for the ratio.
  const hasActualSpendOv =
    typeof totals.total_actual_dollars_spent === "number" &&
    Number.isFinite(totals.total_actual_dollars_spent);
  const pctFirstOv =
    savedProv.mode === "measured" && hasActualSpendOv
      ? leadWithPct(true, savedDollars)
      : false;
  const eliminatedPctOv = pctFirstOv
    ? spendEliminatedPct(savedDollars, totals.total_actual_dollars_spent as number)
    : null;

  // Fleet pulse: bucket events by time. Two modes.
  //   rolling-24h (default): the panel's original behavior — 24 hourly
  //     buckets anchored to "now", reads as a "last 24h" sparkline.
  //   autowiden (stale data): when the most-recent event is more than 24h
  //     old, the rolling-24h chart is mathematically zero across the whole
  //     window. Switch to round-number buckets spanning [earliest, latest]
  //     so a viewer sees the actual upload pattern instead of a flat line.
  //     The /benchmark route hits this path: bench data is static, days old.
  //
  // Bucketing uses `timestamp_hour` (unix seconds at the hour the event
  // was attributed to by the library — already truncated to the hour).
  const fleetPulse = useMemo(() => {
    // Demo replay: cumulative measured savings, one point per recorded
    // run — the line's tip moves with EVERY replayed loop. (An
    // arrival-rate chart can't be "live" here: the replay reveals runs
    // at a constant ~1/s, so per-time arrivals would be a flat line.)
    // `events` is the visible prefix (already filter-aware), newest
    // first — reverse into run order for the accrual.
    if (demo) {
      const accrual = savingsAccrual([...events].reverse());
      return {
        mode: "savings-accrual" as const,
        buckets: accrual,
        bucketHours: 0,
        label: "Savings accrual · measured $ · every run",
        caption:
          "each replayed run adds its own measured paired-baseline savings" as string | null,
      };
    }
    const STALE_AFTER_S = 24 * 3600;
    const nowS = Math.floor(Date.now() / 1000);

    // Find the most-recent event timestamp; fall back to rolling-24h if
    // there are no events at all (no point auto-widening empty).
    let latest = 0;
    let earliest = Number.POSITIVE_INFINITY;
    for (const e of events) {
      if (e.timestamp_hour > latest) latest = e.timestamp_hour;
      if (e.timestamp_hour < earliest) earliest = e.timestamp_hour;
    }
    const isStale = events.length > 0 && nowS - latest > STALE_AFTER_S;

    if (!isStale) {
      // Original: 24 hourly buckets ending at "now".
      const buckets = new Array(24).fill(0) as number[];
      for (const e of events) {
        const hoursAgo = Math.floor((nowS - e.timestamp_hour) / 3600);
        if (hoursAgo >= 0 && hoursAgo < 24) buckets[23 - hoursAgo]!++;
      }
      return {
        mode: "rolling-24h" as const,
        buckets,
        bucketHours: 1,
        label: "24h fleet pulse · loop events / hour",
        caption: null as string | null,
      };
    }

    // Auto-widen: pick a round bucket size so the row of bars has
    // 8-24 buckets across the actual data span.
    const spanS = Math.max(latest - earliest, 3600); // at least 1h
    const spanH = spanS / 3600;
    // Round bucket sizes that read cleanly in the caption.
    const bucketHours =
      spanH <= 48 ? 4
        : spanH <= 168 ? 12 // 7d
        : spanH <= 720 ? 24 // 30d
        : 72;
    const bucketCount = Math.max(1, Math.ceil(spanH / bucketHours));
    const buckets = new Array(bucketCount).fill(0) as number[];
    const startS = latest - bucketCount * bucketHours * 3600;
    for (const e of events) {
      const offsetS = e.timestamp_hour - startS;
      const idx = Math.floor(offsetS / (bucketHours * 3600));
      if (idx >= 0 && idx < bucketCount) buckets[idx]!++;
    }
    const spanLabel =
      spanH < 48 ? `${Math.round(spanH)}h`
        : `${Math.round(spanH / 24)}d`;
    return {
      mode: "autowiden" as const,
      buckets,
      bucketHours,
      label: `Recent activity · ${bucketHours}h buckets`,
      caption: `data window: most recent ${spanLabel} · ${bucketCount} buckets`,
    };
  }, [events, demo]);

  // Recent transitions: 8 most recent events with their classified band.
  // In demo the events prop's head IS the most recently replayed run —
  // rows revealed this session animate in and show their reveal time.
  const transitions = useMemo(() => {
    return events.slice(0, 8).map((e) => {
      const revealedAt = e.id != null ? replay.revealedMap.get(e.id) : undefined;
      return {
        ts: revealedAt ?? e.timestamp_hour * 1000,
        band: bandFromEvent(e),
        workloadId: e.workload_id ?? "—",
        iterations: e.iterations_used,
        isReplay: revealedAt != null,
      };
    });
  }, [events, replay.revealedMap, replay.visibleCount]);

  // Latest-trajectory selection. Prefer the most recent attention-worthy
  // run (OSCILLATING / DIVERGING) so an operator opens to the run they'd
  // actually want to look at; fall back to most-recent-with-id when the
  // fleet is healthy. v1/v2-era events without ids are skipped — the
  // trajectory fetch requires /v1/event/:id.
  const trajectoryEvent = useMemo<LoopEvent | null>(() => {
    const withId = events.filter((e) => e.id != null);
    if (withId.length === 0) return null;
    const attention = withId.find((e) => {
      const band = bandFromEvent(e);
      return band === "OSCILLATING" || band === "DIVERGING";
    });
    return attention ?? withId[0] ?? null;
  }, [events]);
  // The animated replay trajectory needs the revealed run's detail; when
  // the prefetcher hasn't caught up yet — or the just-replayed run
  // doesn't match the active filters — fall back to the static path so
  // the trajectory card stays coherent with the rest of the screen.
  const { filters } = useFilters();
  const replayLatest =
    replay.latest &&
    replay.latest.detail &&
    matchesFilters(replay.latest.event, filters)
      ? replay.latest
      : null;
  const trajectoryDetail = useEventDetail(replayLatest ? null : trajectoryEvent?.id ?? null);

  const pulseBuckets = fleetPulse.buckets;

  return (
    <>
      <PanelHeader
        eyebrow={
          isStale
            ? `Fleet · ${windowLabel} (refreshing…)`
            : `Fleet · ${windowLabel}`
        }
        title="Overview"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="label">
              Updated <span className="mono">{fmtTime(Date.now())}</span>
            </span>
          </div>
        }
      />

      <div className="overview-grid">
        <div
          className="card span-5"
          style={{
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
            <div style={{ width: "100%", maxWidth: 240, aspectRatio: "1 / 1" }}>
              <OutcomeDistGauge
                valueLabel="% CONVERGED"
                value={convergenceRate}
                valueSub={`${fmtCompact(convCount)} of ${fmtCompact(totalEvents)} runs`}
                slices={visibleCells.map((cell) => ({
                  label: cell.short,
                  count: cell.count,
                  color: cell.colorVar,
                }))}
              />
            </div>
          </div>
          <div className="band-strip">
            {visibleCells.map((cell) => {
              const pct = totalEvents > 0 ? (cell.count / totalEvents) * 100 : 0;
              return (
                <div key={cell.key} className="band-cell">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      marginBottom: 6,
                    }}
                  >
                    <span className={`pill pill-${cell.cls}`} style={{ fontSize: 9.5 }}>
                      <span className={`dot dot-${cell.cls}`} />
                      {cell.short}
                    </span>
                  </div>
                  <div
                    className="mono band-cell-num"
                    style={{ color: cell.colorVar }}
                  >
                    {fmtInt(cell.count)}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}
                  >
                    {pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="card span-7"
          style={{
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div className="label">
              {windowSuffix} · saved by LoopGain
              {(demo || savedProv.mode !== "measured") && (
                <span
                  className="mono"
                  style={{
                    marginLeft: 10,
                    fontSize: 9.5,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background:
                      savedProv.mode === "measured"
                        ? "color-mix(in oklab, var(--band-fast) 18%, transparent)"
                        : "var(--surf-3)",
                    color:
                      savedProv.mode === "measured"
                        ? "var(--band-fast)"
                        : "var(--text-3)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {savedProv.badge}
                </span>
              )}
            </div>
            <button
              type="button"
              className="chip"
              onClick={() => setRoute("waste")}
              style={{ background: "var(--surf-2)", whiteSpace: "nowrap" }}
            >
              Open Waste panel <Icon.Chevron />
            </button>
          </div>
          <div>
            <div
              className="mono"
              style={{
                fontSize: 64,
                fontWeight: 500,
                color: "var(--band-fast)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {pctFirstOv && eliminatedPctOv != null
                ? fmtPct(eliminatedPctOv)
                : fmtUSD(savedDollars, { cents: hasActualSavings })}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-2)" }}>
              {pctFirstOv && eliminatedPctOv != null && (
                <>
                  of loop spend eliminated ·{" "}
                  <span className="mono" style={{ color: "var(--text-1)" }}>
                    {fmtUSD(savedDollars, { cents: true })}
                  </span>{" "}
                  measured ·{" "}
                </>
              )}
              {fmtCompact(totals.total_savings)} iterations saved ·{" "}
              {fmtCompact(totals.rollbacks)} rollbacks executed
            </div>
          </div>

          <div
            style={{
              marginTop: 8,
              padding: "12px 0 0 0",
              borderTop: "1px solid var(--border)",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <div className="label">{fleetPulse.label}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                {fleetPulse.mode === "savings-accrual" ? (
                  <>
                    {"so far "}
                    <span style={{ color: "var(--text-1)" }}>
                      {fmtUSD(pulseBuckets[pulseBuckets.length - 1] ?? 0, { cents: true })}
                    </span>
                    {" · "}
                    <span style={{ color: "var(--text-1)" }}>{pulseBuckets.length}</span>
                    {" runs"}
                  </>
                ) : (
                  <>
                    peak <span style={{ color: "var(--text-1)" }}>{Math.max(...pulseBuckets)}</span>
                    {" · total "}
                    <span style={{ color: "var(--text-1)" }}>
                      {pulseBuckets.reduce((s, v) => s + v, 0)}
                    </span>
                  </>
                )}
              </div>
            </div>
            {(fleetPulse.caption || demo) && (
              <div
                className="mono"
                style={{
                  marginTop: 4,
                  fontSize: 10,
                  color: "var(--text-3)",
                }}
              >
                {fleetPulse.caption}
              </div>
            )}
            <div style={{ marginTop: 10, flex: 1, minHeight: 96, display: "flex" }}>
              <div style={{ flex: 1, alignSelf: "stretch" }}>
                <Sparkline
                  data={pulseBuckets}
                  width={680}
                  height={150}
                  color="var(--accent)"
                  strokeWidth={1.5}
                  responsive
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className="card span-12"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
                Latest run trajectory
              </h3>
              {replayLatest ? (
                <>
                  <StatePill band={bandFromEvent(replayLatest.event)} size="sm" />
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {replayLatest.event.workload_id ?? "—"} · recorded run ·
                    replayed {fmtRel(replayLatest.revealedAt)}
                  </span>
                </>
              ) : (
                <>
                  {trajectoryEvent && (
                    <StatePill band={bandFromEvent(trajectoryEvent)} size="sm" />
                  )}
                  {trajectoryEvent && (
                    <span
                      className="mono"
                      style={{ fontSize: 11, color: "var(--text-3)" }}
                    >
                      {trajectoryEvent.workload_id ?? "—"} · {fmtRel(trajectoryEvent.timestamp_hour * 1000)}
                    </span>
                  )}
                </>
              )}
            </div>
            {(replayLatest?.event.workload_id ?? trajectoryEvent?.workload_id) && (
              <button
                type="button"
                className="chip"
                onClick={() =>
                  setRoute(
                    loopRouteId(
                      (replayLatest?.event.workload_id ??
                        trajectoryEvent?.workload_id) as string,
                    ),
                  )
                }
                style={{ background: "var(--surf-2)", whiteSpace: "nowrap" }}
              >
                Open in Loop Detail <Icon.Chevron />
              </button>
            )}
          </div>
          {replayLatest ? (
            <ReplayTrajectory replay={replayLatest} />
          ) : (
            <TrajectoryCardBody
              detailState={trajectoryDetail.state}
              hasCandidate={trajectoryEvent != null}
            />
          )}
        </div>

        <div
          className="card span-6 kpi-quad"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
          }}
        >
          {(() => {
            // Buyer-facing KPI quad — four diverse signals across efficiency
            // (iterations), stability (convergence rate), responsiveness
            // (avg iters per run), and mechanism (rollbacks). Aβ-derived
            // statistics moved to the Convergence panel where they have
            // proper context (band-strip + per-band classifier + ≥2-iters
            // methodology footnote).
            const cap = totals.event_count * FIXED_CAP_BASELINE;
            const reductionPct = cap > 0 ? (totals.total_savings / cap) * 100 : 0;
            const convRatePct =
              totals.event_count > 0 ? (convCount / totals.event_count) * 100 : 0;
            const avgIters =
              totals.event_count > 0
                ? totals.total_iterations / totals.event_count
                : 0;
            const sooner =
              FIXED_CAP_BASELINE > 0
                ? ((FIXED_CAP_BASELINE - avgIters) / FIXED_CAP_BASELINE) * 100
                : 0;
            const rollbackEvery =
              totals.rollbacks > 0 ? totals.event_count / totals.rollbacks : 0;
            return [
              {
                label: `Iterations · ${windowSuffix}`,
                value: `${fmtCompact(totals.total_iterations)} / ${fmtCompact(cap)}`,
                sub: `${reductionPct.toFixed(1)}% reduction vs max_iter=${FIXED_CAP_BASELINE} cap · ${fmtCompact(totals.event_count)} runs`,
              },
              {
                label: `Convergence rate · ${windowSuffix}`,
                value: `${convRatePct.toFixed(1)}%`,
                sub: `${fmtCompact(convCount)} of ${fmtCompact(totals.event_count)} runs`,
              },
              {
                label: `Avg iters per run · ${windowSuffix}`,
                value: avgIters.toFixed(2),
                sub: `vs ${FIXED_CAP_BASELINE.toFixed(1)} cap · ${sooner.toFixed(0)}% sooner to stop`,
              },
              {
                label: `Rollbacks · ${windowSuffix}`,
                value: fmtCompact(totals.rollbacks),
                sub:
                  totals.rollbacks > 0
                    ? `one every ${rollbackEvery.toFixed(1)} runs · best-so-far preserved`
                    : "best-so-far rollback not yet triggered",
              },
            ];
          })().map((k, i) => (
            <div
              key={i}
              style={{
                padding: 18,
                borderRight: i % 2 === 0 ? "1px solid var(--border)" : "none",
                borderBottom: i < 2 ? "1px solid var(--border)" : "none",
              }}
            >
              <KPI label={k.label} value={k.value} sub={k.sub} />
            </div>
          ))}
        </div>

        <div className="card span-6" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-h">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3>Recent runs</h3>
              {replay.enabled && (
                <span
                  className="mono"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 9.5,
                    padding: "2px 7px",
                    borderRadius: 3,
                    background: "color-mix(in oklab, var(--accent) 14%, transparent)",
                    color: "var(--accent)",
                    letterSpacing: "0.05em",
                  }}
                  title="Replaying real recorded runs from the public benchmark (loopgain.ai/benchmark). Recorded measurements, not live inference."
                >
                  <span
                    className="pulse-dot"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: "var(--accent)",
                    }}
                  />
                  LIVE REPLAY
                </span>
              )}
            </div>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
              {replay.enabled
                ? `run ${fmtInt(replay.visibleCount)} of ${fmtInt(
                    replay.ordered.length,
                  )} · recorded benchmark replay`
                : `${transitions.length} events`}
            </span>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
            {transitions.length === 0 && (
              <div style={{ padding: 18, color: "var(--text-3)", fontSize: 12 }}>
                No events in window.
              </div>
            )}
            {transitions.map((t, i) => {
              // Rows drill into Loop Detail — previously they were static
              // text, a dead end on the most natural "look at this run"
              // affordance in the product.
              const clickable = t.workloadId !== "—";
              return (
                <div
                  key={`${t.ts}-${t.workloadId}`}
                  className={t.isReplay ? "recent-row replay-enter" : "recent-row"}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => setRoute(loopRouteId(t.workloadId)) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setRoute(loopRouteId(t.workloadId));
                          }
                        }
                      : undefined
                  }
                  title={clickable ? `Open ${t.workloadId} in Loop Detail` : undefined}
                  style={{
                    borderBottom: i < transitions.length - 1 ? "1px solid var(--border)" : "none",
                    cursor: clickable ? "pointer" : undefined,
                  }}
                >
                  <div className="mono recent-ts" style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {fmtRel(t.ts)}
                  </div>
                  <StatePill band={t.band} size="sm" />
                  <div
                    className="mono"
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {t.workloadId}
                  </div>
                  <div className="mono recent-iter" style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {t.iterations} iter
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {[
          {
            route: "health-map" as const,
            icon: "Map" as const,
            title: "Loop Health Map",
            desc: `${fmtInt(totalEvents)} loops · ${fmtInt(attentionCount)} need attention`,
            badge: hasDiverged ? "div" : null,
          },
          {
            route: "rollbacks" as const,
            icon: "Undo" as const,
            title: "Rollback Log",
            desc: `${fmtInt(totals.rollbacks)} rollback events · audit trail`,
            badge: null,
          },
          {
            route: "convergence" as const,
            icon: "Trend" as const,
            title: "Convergence",
            desc:
              typeof totals.event_count_with_best_index === "number" &&
              totals.event_count_with_best_index > 0
                ? (() => {
                    const iw = iterationWasteFleet({
                      event_count_with_best_index: totals.event_count_with_best_index!,
                      event_count_best_at_iter1: totals.event_count_best_at_iter1 ?? 0,
                      total_iterations_past_best: totals.total_iterations_past_best ?? 0,
                      total_savings: totals.total_savings,
                    });
                    return `${fmtPct(iw.pctBestAtIter1)} best at iter 1 · ${fmtPct(iw.grindEliminatedPct)} grind cut`;
                  })()
                : "iterations-to-best · no static cap works",
            badge: null,
          },
        ].map((c, i) => {
          const IconComp = Icon[c.icon];
          const go = () => setRoute(c.route);
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={go}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  go();
                }
              }}
              className="card span-4"
              style={{
                padding: 16,
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <IconComp />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{c.title}</span>
                {c.badge && (
                  <Chip on>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background:
                          c.badge === "div"
                            ? "var(--band-div)"
                            : c.badge === "osc"
                            ? "var(--band-osc)"
                            : "var(--band-stall)",
                      }}
                    />
                    attention
                  </Chip>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{c.desc}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TrajectoryCardBody({
  detailState,
  hasCandidate,
}: {
  detailState: LoadState<EventDetailResponse>;
  hasCandidate: boolean;
}) {
  if (!hasCandidate) {
    return (
      <TrajectoryEmpty>
        No recent runs with per-iteration data. Trajectories require
        loopgain ≥ 0.1.6 reporting events.
      </TrajectoryEmpty>
    );
  }

  const event =
    detailState.status === "ok"
      ? detailState.data.event
      : detailState.status === "loading" && detailState.previous
      ? detailState.previous.event
      : detailState.status === "error" && detailState.previous
      ? detailState.previous.event
      : null;

  if (detailState.status === "error" && !event) {
    return (
      <TrajectoryEmpty>
        Couldn't load trajectory: {detailState.error.message}
      </TrajectoryEmpty>
    );
  }
  if (!event) {
    // loading without a previous payload — keep the slot a stable height.
    return <div style={{ height: 220 }} />;
  }
  if (!event.per_iteration) {
    return (
      <TrajectoryEmpty>
        This run was reported as a summary (library {event.library_version}).
        Per-iteration trajectories require loopgain ≥ 0.1.6.
      </TrajectoryEmpty>
    );
  }
  return <TrajectoryChart pit={event.per_iteration} />;
}

/** Animated replay of a recorded run's per-iteration trajectory: the
 *  error/Aβ trace draws in iteration by iteration, so a demo visitor
 *  watches the loop "run" — with data that was measured when the
 *  benchmark actually ran, not generated now. */
function ReplayTrajectory({ replay }: { replay: ReplayLatest }) {
  const pit = replay.detail?.per_iteration ?? null;
  const n = pit?.error_history.length ?? 0;
  const [drawn, setDrawn] = useState(1);

  useEffect(() => {
    setDrawn(1);
    if (!pit || n <= 1) return;
    const id = window.setInterval(() => {
      setDrawn((v) => {
        if (v >= n) {
          window.clearInterval(id);
          return v;
        }
        return v + 1;
      });
      // 120ms/iteration: even a 5-iteration run finishes its draw before
      // the next recorded run replaces it at the ~0.5s reveal cadence.
    }, 120);
    return () => window.clearInterval(id);
  }, [replay, pit, n]);

  if (!pit) {
    return (
      <TrajectoryEmpty>
        This recorded run has no per-iteration data to replay.
      </TrajectoryEmpty>
    );
  }
  const sliced = {
    ...pit,
    error_history: pit.error_history.slice(0, drawn),
    convergence_profile: pit.convergence_profile.slice(0, Math.max(0, drawn - 1)),
  };
  return <TrajectoryChart pit={sliced} />;
}

function TrajectoryEmpty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-3)",
        fontSize: 12,
        textAlign: "center",
        padding: "0 24px",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
