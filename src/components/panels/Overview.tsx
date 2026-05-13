// Overview — fleet health at a glance, computed from real /v1/stats + /v1/events.

import { useMemo } from "react";
import { useEvents, useStats } from "../../lib/data-hooks";
import { BANDS, BAND_COLOR, bandFromEvent } from "../../lib/bands";
import { fmtRel, fmtTime, fmtUSD, fmtInt } from "../../lib/format";
import { median, percentile } from "../../lib/stats";
import { Chip, Icon, KPI, PanelHeader, StatePill } from "../primitives";
import { RingGauge, Sparkline } from "../charts";
import { Loaded } from "./PanelState";
import type { RouteId, TimeRange } from "../shell";
import type { Band, LoopEvent, StatsResponse } from "../../types";

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
  const bands = useMemo(() => events.map((e) => bandFromEvent(e)), [events]);
  const bandCounts = useMemo(() => {
    const c: Record<Band, number> = {
      FAST_CONVERGE: 0,
      CONVERGING: 0,
      STALLING: 0,
      OSCILLATING: 0,
      DIVERGING: 0,
    };
    for (const b of bands) c[b]++;
    return c;
  }, [bands]);
  const total = events.length;

  // Aβ_median across recent events. Use profile_max as the per-loop Aβ_smooth
  // proxy (the loop's worst point), then take the fleet median of those.
  const abValues = useMemo(() => events.map((e) => e.profile_max), [events]);
  const abMedian = median(abValues) ?? 0;
  const abP99 = percentile(abValues, 0.99) ?? 0;

  const gmValues = useMemo(() => events.map((e) => e.gain_margin), [events]);
  const gmMedian = median(gmValues) ?? 0;
  const gmP10 = percentile(gmValues, 0.1) ?? 0;

  const totals = stats.totals ?? {
    event_count: 0,
    total_iterations: 0,
    total_savings: 0,
    rollbacks: 0,
  };
  const savedDollars = totals.total_savings * costPerIter;

  // 24h fleet pulse: bucket recent events by hour, plot count.
  const fleetPulse = useMemo(() => {
    const buckets = new Array(24).fill(0) as number[];
    const now = Math.floor(Date.now() / 1000);
    for (const e of events) {
      const hoursAgo = Math.floor((now - e.timestamp_hour) / 3600);
      if (hoursAgo >= 0 && hoursAgo < 24) buckets[23 - hoursAgo]!++;
    }
    return buckets;
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

  const attentionCount = bandCounts.OSCILLATING + bandCounts.DIVERGING;

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
              <RingGauge value={abMedian} sub={`across ${total} loop events`} />
            </div>
          </div>
          <div className="band-strip">
            {BANDS.map((b) => {
              const count = bandCounts[b.id];
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={b.id} className="band-cell">
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                    <span className={`pill pill-${b.cls}`} style={{ fontSize: 9.5 }}>
                      <span className={`dot dot-${b.cls}`} />
                      {b.short}
                    </span>
                  </div>
                  <div
                    className="mono band-cell-num"
                    style={{ color: BAND_COLOR[b.id] }}
                  >
                    {count}
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
              <div className="label">24h fleet pulse · loop events / hour</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                peak <span style={{ color: "var(--text-1)" }}>{Math.max(...fleetPulse)}</span>
                {" · total "}
                <span style={{ color: "var(--text-1)" }}>
                  {fleetPulse.reduce((s, v) => s + v, 0)}
                </span>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <Sparkline
                data={fleetPulse}
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
            desc: `${total} recent loops · ${attentionCount} need attention`,
            badge: bandCounts.DIVERGING > 0 ? "div" : null,
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
