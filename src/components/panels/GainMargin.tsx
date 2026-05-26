// Panel 4 — Gain Margin Distribution.
//
// Histogram of gain_margin across recent events. Reference markers at the
// three meaningful thresholds: GM=1.0 (instability), GM=1.2 (risky), GM=1.8
// (healthy). Hover reveals which workloads landed in each bucket.

import { useMemo, useState } from "react";
import { useEvents, useStats } from "../../lib/data-hooks";
import { Histogram } from "../charts";
import { KPI, PanelHeader } from "../primitives";
import { Loaded } from "./PanelState";
import { histogram, linEdges, median, percentile, type Bucket } from "../../lib/stats";
import { fmtInt, fmtPct } from "../../lib/format";
import type { LoopEvent, StatsResponse } from "../../types";

interface Props {
  pollMs?: number;
  sinceHours?: number;
}

// Compose the "N of M · context" sublabel. The denominator is the
// count of events with a non-null gain_margin (only loops that ran
// long enough to measure GM). When that's < the tenant's total
// event count, say so explicitly — it isn't a sample cap, it's a
// data-availability filter.
function fleetwideScopeNote(
  count: number,
  withGM: number,
  total: number,
  context: string,
): string {
  const tail = withGM < total ? "with GM · " : "· ";
  return `${fmtInt(count)} of ${fmtInt(withGM)} ${tail}${context}`;
}

export function GainMargin({ pollMs, sinceHours }: Props) {
  const events = useEvents({ pollMs, sinceHours });
  const stats = useStats({ pollMs });
  return (
    <div style={{ padding: 24 }}>
      <Loaded state={events.state}>
        {(eventsData) => (
          <Loaded state={stats.state}>
            {(statsData) => (
              <GainMarginBody events={eventsData.events} stats={statsData} />
            )}
          </Loaded>
        )}
      </Loaded>
    </div>
  );
}

function GainMarginBody({
  events,
  stats,
}: {
  events: ReadonlyArray<LoopEvent>;
  stats: StatsResponse;
}) {
  const [hover, setHover] = useState<Bucket | null>(null);

  const eventsWithGM = useMemo(
    () => events.filter((e) => e.gain_margin != null && isFinite(e.gain_margin)),
    [events],
  );

  // Tenant-wide median/p10 come from the server (/stats.aggregates), not
  // from the local 500-event sample — otherwise this page disagrees with
  // the Overview KPI quad and Loop Detail. The histogram below still
  // shows the sample distribution (no server-side histogram endpoint),
  // but the headline KPIs match what the rest of the dashboard reports.
  const sampleGms = useMemo(() => eventsWithGM.map((e) => e.gain_margin!), [eventsWithGM]);
  const agg = stats.aggregates;
  const gmMedian = agg?.gm_median ?? median(sampleGms) ?? 0;
  const gmP10 = agg?.gm_p10 ?? percentile(sampleGms, 0.1) ?? 0;
  const totalEvents = stats.totals?.event_count ?? eventsWithGM.length;
  const belowRisky = eventsWithGM.filter((e) => e.gain_margin! < 1.2).length;
  const belowInstability = eventsWithGM.filter((e) => e.gain_margin! < 1.0).length;
  const pctBelowRisky = eventsWithGM.length > 0 ? belowRisky / eventsWithGM.length : 0;

  const buckets = useMemo(() => {
    if (eventsWithGM.length === 0) return [];
    const edges = linEdges(0.6, 3.24, 22);
    return histogram(
      eventsWithGM.map((e) => ({ value: e.gain_margin, id: e.workload_id ?? undefined })),
      edges,
    );
  }, [eventsWithGM]);

  return (
    <>
      <PanelHeader title="Gain Margin Distribution" />

      <div className="card gm-kpi-strip" style={{ padding: 0 }}>
        {[
          {
            label: "Median GM",
            value: gmMedian.toFixed(2),
            sub: `${fmtInt(totalEvents)} events · fleet-wide`,
          },
          { label: "p10 GM", value: gmP10.toFixed(2), sub: "worst 10% · fleet-wide" },
          {
            label: "GM < 1.2",
            value: fmtPct(pctBelowRisky),
            sub: fleetwideScopeNote(belowRisky, eventsWithGM.length, totalEvents, "risky band"),
          },
          {
            label: "GM < 1.0",
            value: fmtInt(belowInstability),
            sub: fleetwideScopeNote(belowInstability, eventsWithGM.length, totalEvents, "past instability"),
          },
        ].map((k, i) => (
          <div
            key={i}
            style={{
              padding: 18,
              borderLeft: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <KPI label={k.label} value={k.value} sub={k.sub} />
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{ marginTop: 16, padding: 16, position: "relative" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 6,
          }}
        >
          <div className="label">GM = 1 / max(Aβ_smooth) · fleet histogram</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
            buckets <span style={{ color: "var(--text-1)" }}>{buckets.length}</span> · bin width{" "}
            <span style={{ color: "var(--text-1)" }}>0.12</span>
          </div>
        </div>
        <Histogram
          buckets={buckets}
          width={1080}
          height={280}
          refs={[
            { at: 1.0, label: "GM=1.0 instability", color: "var(--band-osc)", anchor: "end" },
            { at: 1.2, label: "GM=1.2 risky", color: "var(--band-stall)", anchor: "start" },
            { at: 1.8, label: "GM=1.8 healthy", color: "var(--band-conv)" },
          ]}
          onHover={(b) => setHover(b)}
        />
        {hover && (
          <div
            style={{
              position: "absolute",
              left: 60,
              top: 24,
              background: "var(--surf-3)",
              border: "1px solid var(--border-2)",
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 11.5,
              fontFamily: "var(--mono)",
              pointerEvents: "none",
              zIndex: 50,
              maxWidth: 280,
              boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ color: "var(--text-3)" }}>
              GM bucket{" "}
              <span style={{ color: "var(--text-1)" }}>
                [{hover.lo.toFixed(2)}, {hover.hi.toFixed(2)})
              </span>
            </div>
            <div style={{ color: "var(--text-3)", marginTop: 2 }}>
              <span style={{ color: "var(--text-1)" }}>{hover.count}</span> events
            </div>
            {hover.ids.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {[...new Set(hover.ids)].slice(0, 5).map((id) => (
                  <div key={id} style={{ color: "var(--text-2)", fontSize: 10.5 }}>
                    {id}
                  </div>
                ))}
                {new Set(hover.ids).size > 5 && (
                  <div style={{ color: "var(--text-3)", fontSize: 10.5 }}>
                    +{new Set(hover.ids).size - 5} more workloads
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          Interpretation
        </div>
        <div
          className="gm-interp"
          style={{ fontSize: 12, color: "var(--text-2)" }}
        >
          <div>
            <div className="mono" style={{ color: "var(--band-osc)", marginBottom: 4 }}>
              GM &lt; 1.0
            </div>
            Loop is at or past the stability boundary. Errors compound between iterations.
            Configure rollback rule.
          </div>
          <div>
            <div className="mono" style={{ color: "var(--band-stall)", marginBottom: 4 }}>
              1.0 ≤ GM &lt; 1.2
            </div>
            Loop converges but has no safety buffer. Small drift in critic quality flips it into
            oscillation.
          </div>
          <div>
            <div className="mono" style={{ color: "var(--band-conv)", marginBottom: 4 }}>
              GM ≥ 1.8
            </div>
            Healthy. Loop has substantial margin against critic-quality regression and prompt
            drift.
          </div>
        </div>
      </div>
    </>
  );
}
