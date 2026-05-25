// Overview — fleet health at a glance, computed from real /v1/stats + /v1/events.

import { useMemo, type ReactNode } from "react";
import { useEventDetail, useEvents, useStats } from "../../lib/data-hooks";
import { bandFromEvent } from "../../lib/bands";
import { fmtRel, fmtTime, fmtUSD, fmtInt } from "../../lib/format";
import { median, percentile } from "../../lib/stats";
import { Chip, Icon, KPI, PanelHeader, StatePill } from "../primitives";
import { RingGauge, Sparkline, TrajectoryChart } from "../charts";
import { Loaded } from "./PanelState";
import { loopRouteId } from "../shell/routes";
import type { RouteId, TimeRange } from "../shell";
import type { LoadState } from "../../lib/api";
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
const OUTCOME_CELLS: ReadonlyArray<OutcomeCell> = [
  {
    key: "converged",
    short: "CONV",
    cls: "conv",
    colorVar: "var(--band-conv)",
    matches: ["converged"],
  },
  {
    key: "stalled",
    short: "STALL",
    cls: "stall",
    colorVar: "var(--band-stall)",
    matches: ["stalled", "max_iterations"],
  },
  {
    key: "oscillating",
    short: "OSC",
    cls: "osc",
    colorVar: "var(--band-osc)",
    matches: ["oscillating"],
  },
  {
    key: "diverged",
    short: "DIV",
    cls: "div",
    colorVar: "var(--band-div)",
    matches: ["diverged"],
  },
];

interface Props {
  setRoute: (r: RouteId) => void;
  costPerIter: number;
  pollMs?: number;
  sinceHours?: number;
  timeRange: TimeRange;
}

export function Overview({ setRoute, costPerIter, pollMs, sinceHours, timeRange }: Props) {
  const stats = useStats({ pollMs });
  const events = useEvents({ pollMs, sinceHours });
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
  // Outcome counts come straight from /v1/stats.outcomes — tenant-wide,
  // not sample-biased. Outcomes are the terminal state recorded by the
  // library; the receiver SUMs them on every event in window.
  const outcomeCounts = useMemo<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    for (const row of stats.outcomes) c[row.outcome] = row.count;
    return c;
  }, [stats.outcomes]);
  const totalEvents = stats.totals?.event_count ?? events.length;
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

  // Tenant-wide percentile aggregates from /v1/stats.aggregates when present
  // (newer receiver), else fall back to client-medians over the /events
  // sample (older receiver). The fallback is recency-biased; the server path
  // isn't. Most prod tenants should have aggregates; fallback exists so a
  // self-hosted older receiver still renders something rather than empty.
  const sampleAbValues = useMemo(
    () => events.map((e) => e.profile_max),
    [events],
  );
  const sampleGmValues = useMemo(
    () => events.map((e) => e.gain_margin),
    [events],
  );
  const agg = stats.aggregates;
  const abMedian = agg?.ab_median ?? median(sampleAbValues) ?? 0;
  const abP99 = agg?.ab_p99 ?? percentile(sampleAbValues, 0.99) ?? 0;
  const gmMedian = agg?.gm_median ?? median(sampleGmValues) ?? 0;
  const gmP10 = agg?.gm_p10 ?? percentile(sampleGmValues, 0.1) ?? 0;

  const totals = stats.totals ?? {
    event_count: 0,
    total_iterations: 0,
    total_savings: 0,
    rollbacks: 0,
  };
  const savedDollars = totals.total_savings * costPerIter;

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
  }, [events]);

  // Recent transitions: 8 most recent events with their classified band.
  const transitions = useMemo(() => {
    return events.slice(0, 8).map((e) => ({
      ts: e.timestamp_hour * 1000,
      band: bandFromEvent(e),
      workloadId: e.workload_id ?? "—",
      iterations: e.iterations_used,
    }));
  }, [events]);

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
  const trajectoryDetail = useEventDetail(trajectoryEvent?.id ?? null);

  return (
    <>
      <PanelHeader
        eyebrow={
          isStale
            ? `Fleet · ${timeRange} (refreshing…)`
            : `Fleet · ${timeRange}`
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
              <RingGauge
                value={abMedian}
                sub={`across ${fmtInt(totalEvents)} loop events`}
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
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: "var(--text-3)",
              textAlign: "center",
              marginTop: -6,
            }}
          >
            outcome distribution · {fmtInt(totalEvents)} loop events
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
            <div className="label">30d · saved by LoopGain</div>
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
              {fmtUSD(savedDollars, { cents: false })}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-2)" }}>
              {fmtInt(totals.total_savings)} iterations saved · {fmtInt(totals.rollbacks)} rollbacks
              executed
            </div>
          </div>

          <div
            style={{
              marginTop: 8,
              padding: "12px 0 0 0",
              borderTop: "1px solid var(--border)",
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
                peak <span style={{ color: "var(--text-1)" }}>{Math.max(...fleetPulse.buckets)}</span>
                {" · total "}
                <span style={{ color: "var(--text-1)" }}>
                  {fleetPulse.buckets.reduce((s, v) => s + v, 0)}
                </span>
              </div>
            </div>
            {fleetPulse.caption && (
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
            <div style={{ marginTop: 10 }}>
              <Sparkline
                data={fleetPulse.buckets}
                width={680}
                height={88}
                color="var(--accent)"
                strokeWidth={1.5}
                responsive
              />
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
            </div>
            {trajectoryEvent?.workload_id && (
              <button
                type="button"
                className="chip"
                onClick={() =>
                  setRoute(loopRouteId(trajectoryEvent.workload_id as string))
                }
                style={{ background: "var(--surf-2)", whiteSpace: "nowrap" }}
              >
                Open in Loop Detail <Icon.Chevron />
              </button>
            )}
          </div>
          <TrajectoryCardBody
            detailState={trajectoryDetail.state}
            hasCandidate={trajectoryEvent != null}
          />
        </div>

        <div
          className="card span-6 kpi-quad"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
          }}
        >
          {[
            {
              label: "Median Aβ (per-run max)",
              value: abMedian.toFixed(3),
              sub: "across all events",
            },
            {
              label: "p99 Aβ",
              value: abP99.toFixed(3),
              sub: "worst 1%",
            },
            {
              label: "Gain margin · median",
              value: gmMedian.toFixed(2),
              sub: `p10 = ${gmP10.toFixed(2)}`,
            },
            {
              label: "Total iterations · 30d",
              value: fmtInt(totals.total_iterations),
              sub: `${fmtInt(totals.event_count)} runs`,
            },
          ].map((k, i) => (
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
            <h3>Recent runs</h3>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
              {transitions.length} events
            </span>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
            {transitions.length === 0 && (
              <div style={{ padding: 18, color: "var(--text-3)", fontSize: 12 }}>
                No events in window.
              </div>
            )}
            {transitions.map((t, i) => (
              <div
                key={i}
                className="recent-row"
                style={{
                  borderBottom: i < transitions.length - 1 ? "1px solid var(--border)" : "none",
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
            ))}
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
            route: "gain-margin" as const,
            icon: "Bars" as const,
            title: "Gain Margin",
            desc: `median GM ${gmMedian.toFixed(2)} · p10 ${gmP10.toFixed(2)}`,
            badge: gmP10 < 1.0 ? "osc" : null,
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
