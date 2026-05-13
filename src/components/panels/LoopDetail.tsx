// Loop Detail drill-down — single workload.
//
// Per-iteration data isn't in the telemetry schema, so the prototype's
// best-so-far scrubber is replaced with a per-run table showing each
// recent run's summary stats.

import { useMemo } from "react";
import { useProfiles } from "../../lib/data-hooks";
import { BAND_COLOR, bandFromProfileEvent, outcomeLabel } from "../../lib/bands";
import { Chip, Icon, KPI, StatePill } from "../primitives";
import { ConvergenceOverTime, Sparkline } from "../charts";
import { Loaded } from "./PanelState";
import { fmtAbsTs, fmtAbsTsExact, fmtInt, fmtRel } from "../../lib/format";
import { median } from "../../lib/stats";
import type { RouteId } from "../shell";
import type { ProfileEvent } from "../../types";

interface Props {
  workloadId: string;
  setRoute: (r: RouteId) => void;
}

export function LoopDetail({ workloadId, setRoute }: Props) {
  const profiles = useProfiles({ workloadId });
  return (
    <div style={{ padding: 24 }}>
      <Loaded state={profiles.state}>
        {(profilesData) => (
          <LoopDetailBody
            workloadId={workloadId}
            events={profilesData.events}
            setRoute={setRoute}
          />
        )}
      </Loaded>
    </div>
  );
}

function LoopDetailBody({
  workloadId,
  events,
  setRoute,
}: {
  workloadId: string;
  events: ReadonlyArray<ProfileEvent>;
  setRoute: (r: RouteId) => void;
}) {
  const latest = events[0];
  const recent = events.slice(0, 12);

  const medianAB = useMemo(
    () => median(events.map((e) => e.profile_median)),
    [events],
  );
  const medianGM = useMemo(() => median(events.map((e) => e.gain_margin)), [events]);

  const rolling = useMemo(() => {
    const buckets = new Map<number, number[]>();
    for (const e of events) {
      if (e.profile_median == null) continue;
      const day = Math.floor(e.timestamp_hour / 86400) * 86400;
      const arr = buckets.get(day);
      if (arr) arr.push(e.profile_median);
      else buckets.set(day, [e.profile_median]);
    }
    return Array.from(buckets)
      .map(([ts, vals]) => ({ ts, median: median(vals) ?? 0 }))
      .sort((a, b) => a.ts - b.ts);
  }, [events]);

  if (!latest) {
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <button type="button" className="chip" onClick={() => setRoute("health-map")}>
            <span style={{ transform: "scaleX(-1)" }}>
              <Icon.Chevron />
            </span>
            Back to Health Map
          </button>
          <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: "var(--text-1)" }}>
            {workloadId}
          </div>
        </div>
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--text-3)",
            fontSize: 12,
            border: "1px dashed var(--border-2)",
            borderRadius: 8,
          }}
        >
          No events for this workload in the current window.
        </div>
      </>
    );
  }

  const currentBand = bandFromProfileEvent(latest);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <button type="button" className="chip" onClick={() => setRoute("health-map")}>
          <span style={{ transform: "scaleX(-1)" }}>
            <Icon.Chevron />
          </span>
          Back
        </button>
        <div style={{ height: 16, width: 1, background: "var(--border)" }} />
        <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: "var(--text-1)" }}>
          {workloadId}
        </div>
        <Chip>{fmtInt(events.length)} runs</Chip>
        <span style={{ flex: 1 }} />
        <StatePill band={currentBand} size="lg" />
      </div>

      <div
        className="card loop-kpi-strip"
        style={{ padding: 0, marginBottom: 16 }}
      >
        {[
          {
            label: "Latest Aβ_max",
            value: latest.profile_max != null ? latest.profile_max.toFixed(3) : "—",
            color: BAND_COLOR[currentBand],
          },
          {
            label: "Median Aβ (window)",
            value: medianAB != null ? medianAB.toFixed(3) : "—",
          },
          {
            label: "Latest GM",
            value: latest.gain_margin != null ? latest.gain_margin.toFixed(2) : "—",
            color:
              latest.gain_margin != null && latest.gain_margin < 1.0
                ? "var(--band-osc)"
                : latest.gain_margin != null && latest.gain_margin < 1.2
                ? "var(--band-stall)"
                : undefined,
          },
          {
            label: "Median GM (window)",
            value: medianGM != null ? medianGM.toFixed(2) : "—",
          },
          {
            label: "Latest outcome",
            value: outcomeLabel(latest.outcome),
          },
        ].map((k, i) => (
          <div
            key={i}
            style={{ padding: 18, borderLeft: i === 0 ? "none" : "1px solid var(--border)" }}
          >
            <KPI label={k.label} value={k.value} accent={k.color} />
          </div>
        ))}
      </div>

      <div className="loop-main-grid">
        <div className="card" style={{ padding: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 6,
            }}
          >
            <div className="label">Aβ_median per run · over time</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
              window <span style={{ color: "var(--text-1)" }}>30d</span>
            </div>
          </div>
          <ConvergenceOverTime
            events={events}
            rollingMedian={rolling}
            width={780}
            height={360}
            yMax={1.6}
          />
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-h">
            <h3>Recent runs</h3>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {recent.length === 0 && (
              <div style={{ padding: 14, color: "var(--text-3)", fontSize: 12 }}>
                No runs yet.
              </div>
            )}
            {recent.map((r, i) => {
              const band = bandFromProfileEvent(r);
              const ms = r.timestamp_hour * 1000;
              return (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 14px",
                    borderBottom:
                      i < recent.length - 1 ? "1px solid var(--border)" : "none",
                    background: i === 0 ? "var(--surf-2)" : "transparent",
                  }}
                  title={fmtAbsTsExact(r.timestamp_hour)}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: BAND_COLOR[band],
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--text-1)" }}>
                        {outcomeLabel(r.outcome)} · {r.iterations_used} iter
                      </div>
                      <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                        {fmtRel(ms)}
                      </div>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <Sparkline
                        data={[
                          Math.max(0.02, r.profile_min ?? 0.1),
                          Math.max(0.02, r.profile_median ?? 0.3),
                          Math.max(0.02, r.profile_max ?? 0.5),
                        ]}
                        width={240}
                        height={22}
                        color={BAND_COLOR[band]}
                        fill={false}
                      />
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}
                    >
                      min{" "}
                      <span style={{ color: "var(--text-2)" }}>
                        {r.profile_min != null ? r.profile_min.toFixed(3) : "—"}
                      </span>
                      {" · med "}
                      <span style={{ color: "var(--text-2)" }}>
                        {r.profile_median != null ? r.profile_median.toFixed(3) : "—"}
                      </span>
                      {" · max "}
                      <span style={{ color: "var(--text-2)" }}>
                        {r.profile_max != null ? r.profile_max.toFixed(3) : "—"}
                      </span>
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}
                    >
                      {fmtAbsTs(r.timestamp_hour)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
