// Panel 2 — Convergence Profiles.
//
// Plots per-event `profile_median` over time, with band thresholds as
// background bands and an optional rolling-median trend overlay.
// Optional workload filter; optional sinceHours window override.

import { useMemo, useState } from "react";
import { useProfiles, useStats } from "../../lib/data-hooks";
import { PanelHeader, Chip, StatePill } from "../primitives";
import { ConvergenceOverTime } from "../charts";
import { Loaded } from "./PanelState";
import { median } from "../../lib/stats";
import { fmtInt } from "../../lib/format";
import type { ProfileEvent } from "../../types";

interface Props {
  pollMs?: number;
  sinceHours?: number;
}

export function Convergence({ pollMs, sinceHours }: Props) {
  const stats = useStats({ pollMs });
  const [workloadFilter, setWorkloadFilter] = useState<string | null>(null);
  const [yMax, setYMax] = useState<number>(1.6);
  const [showTrend, setShowTrend] = useState<boolean>(true);
  const profiles = useProfiles({
    workloadId: workloadFilter ?? undefined,
    sinceHours,
    pollMs,
  });

  return (
    <div style={{ padding: 24 }}>
      <Loaded state={stats.state}>
        {(statsData) => (
          <>
            <PanelHeader
              title="Convergence Profiles"
              right={
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Chip on={showTrend} onClick={() => setShowTrend((s) => !s)}>
                    rolling median
                  </Chip>
                  <span className="label">y-max</span>
                  <div
                    style={{
                      display: "flex",
                      border: "1px solid var(--border)",
                      borderRadius: 5,
                      overflow: "hidden",
                    }}
                  >
                    {[1.2, 1.6, 2.0].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setYMax(v)}
                        style={{
                          height: 26,
                          padding: "0 10px",
                          fontSize: 11,
                          fontFamily: "var(--mono)",
                          color: yMax === v ? "var(--text-1)" : "var(--text-3)",
                          background: yMax === v ? "var(--surf-3)" : "transparent",
                        }}
                      >
                        {v.toFixed(1)}
                      </button>
                    ))}
                  </div>
                </div>
              }
            />

            {/* Workload filter chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              <span className="label" style={{ alignSelf: "center", marginRight: 6 }}>
                Workload
              </span>
              <Chip
                on={workloadFilter === null}
                onClick={() => setWorkloadFilter(null)}
              >
                all
              </Chip>
              {statsData.workloads
                .filter(
                  (w): w is { workload_id: string; count: number } => Boolean(w.workload_id),
                )
                .slice(0, 14)
                .map((w) => (
                  <Chip
                    key={w.workload_id}
                    on={workloadFilter === w.workload_id}
                    onClick={() =>
                      setWorkloadFilter(
                        workloadFilter === w.workload_id ? null : w.workload_id,
                      )
                    }
                  >
                    {w.workload_id} ({w.count})
                  </Chip>
                ))}
            </div>

            <Loaded state={profiles.state}>
              {(profilesData) => (
                <ConvergenceBody
                  events={profilesData.events}
                  totalEvents={statsData.totals?.event_count ?? profilesData.events.length}
                  yMax={yMax}
                  showTrend={showTrend}
                />
              )}
            </Loaded>
          </>
        )}
      </Loaded>
    </div>
  );
}

function ConvergenceBody({
  events,
  totalEvents,
  yMax,
  showTrend,
}: {
  events: ReadonlyArray<ProfileEvent>;
  totalEvents: number;
  yMax: number;
  showTrend: boolean;
}) {
  // Rolling median over time: bucket events by hour, take median of profile_median per bucket.
  const rolling = useMemo(() => {
    if (!showTrend || events.length === 0) return [];
    const buckets = new Map<number, number[]>();
    for (const e of events) {
      if (e.profile_median == null) continue;
      const bucket = Math.floor(e.timestamp_hour / 3600) * 3600;
      const arr = buckets.get(bucket);
      if (arr) arr.push(e.profile_median);
      else buckets.set(bucket, [e.profile_median]);
    }
    const out: Array<{ ts: number; median: number }> = [];
    for (const [ts, vals] of buckets) {
      const m = median(vals);
      if (m != null) out.push({ ts, median: m });
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }, [events, showTrend]);

  const fleetMedian = useMemo(
    () => median(events.map((e) => e.profile_median)),
    [events],
  );

  return (
    <>
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 8,
          }}
        >
          <div>
            <div className="label">Aβ_median per run · over time</div>
            <div
              className="mono"
              style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}
            >
              n=<span style={{ color: "var(--text-1)" }}>{fmtInt(events.length)}</span>{" "}
              {events.length < totalEvents
                ? <>sampled of {fmtInt(totalEvents)} fleet-wide</>
                : "runs"}
              {fleetMedian != null && (
                <>
                  {" · "}
                  {events.length < totalEvents ? "sample" : "fleet"} median{" "}
                  <span style={{ color: "var(--text-1)" }}>{fleetMedian.toFixed(3)}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, borderTop: "2.5px solid var(--accent)" }} />
              <span className="mono" style={{ color: "var(--text-2)" }}>
                rolling median
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--text-3)", opacity: 0.5 }} />
              <span className="mono" style={{ color: "var(--text-2)" }}>
                individual runs (band-colored)
              </span>
            </div>
          </div>
        </div>
        <ConvergenceOverTime events={events} rollingMedian={rolling} width={1080} height={400} yMax={yMax} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h3>State classifier</h3>
        </div>
        <div style={{ padding: "4px 0" }}>
          {[
            { id: "FAST_CONVERGE" as const, range: "cumulative E ≤ 10%", desc: "Strong contraction. Halt early if budget-bound." },
            { id: "CONVERGING" as const, range: "trend < 0, p < 0.05", desc: "Healthy convergence. Continue." },
            { id: "STALLING" as const, range: "no trend, no oscillation", desc: "No progress. Stops after 2 consecutive readings." },
            { id: "OSCILLATING" as const, range: "high variance, flat trend", desc: "No net error reduction. Rollback armed." },
            { id: "DIVERGING" as const, range: "trend > 0, p < 0.05, cumul > 110%", desc: "Error growing. Roll back to best-so-far." },
          ].map((b, i) => (
            <div
              key={b.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: 12,
                padding: "10px 14px",
                alignItems: "flex-start",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <StatePill band={b.id} size="sm" />
              <div>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-1)" }}>
                  {b.range}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                  {b.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
