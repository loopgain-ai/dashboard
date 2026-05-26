// Loop Detail drill-down — single workload.
//
// Recent runs are clickable. Selecting one fetches per-iteration trajectory
// data via /v1/event/:id and renders a scrubber: a slider over iteration
// index plus a line chart showing error magnitude and Aβ across iterations.
// Schema v3 (loopgain >= 0.1.6) is required for per-iteration data;
// older runs render the per-run summary only.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useEventDetail, useProfiles } from "../../lib/data-hooks";
import { BAND_COLOR, bandFromProfileEvent, outcomeLabel } from "../../lib/bands";
import { Chip, Icon, KPI, StatePill } from "../primitives";
import { ConvergenceOverTime, Sparkline, TrajectoryChart } from "../charts";
import { Loaded } from "./PanelState";
import { fmtAbsTs, fmtAbsTsExact, fmtInt, fmtRel } from "../../lib/format";
import { median } from "../../lib/stats";
import type { RouteId } from "../shell";
import type { EventDetail, PerIteration, ProfileEvent } from "../../types";

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

  // The selected run drives the scrubber. Default to the most recent run
  // that has an id; v2-era events without ids fall back to summary view.
  const defaultId = useMemo(
    () => events.find((e) => e.id != null)?.id ?? null,
    [events],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    setSelectedId(defaultId);
  }, [defaultId]);
  const detail = useEventDetail(selectedId);

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
        <Chip>{fmtInt(events.length)} {events.length === 1 ? "run" : "runs"}</Chip>
        <span style={{ flex: 1 }} />
        <StatePill band={currentBand} size="lg" />
      </div>

      <div
        className="card loop-kpi-strip"
        style={{ padding: 0, marginBottom: 16 }}
      >
        {[
          {
            label: <>Latest A<NoCase>β</NoCase>_max</>,
            value: latest.profile_max != null ? latest.profile_max.toFixed(3) : "—",
            color: BAND_COLOR[currentBand],
          },
          {
            label: <>Median A<NoCase>β</NoCase> (window)</>,
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
              const isSelected = r.id != null && r.id === selectedId;
              const clickable = r.id != null;
              return (
                <div
                  key={r.id ?? i}
                  onClick={clickable ? () => setSelectedId(r.id!) : undefined}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 14px",
                    borderBottom:
                      i < recent.length - 1 ? "1px solid var(--border)" : "none",
                    background: isSelected
                      ? "color-mix(in oklab, var(--accent) 14%, var(--surf-1))"
                      : i === 0
                      ? "var(--surf-2)"
                      : "transparent",
                    borderLeft: isSelected
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    cursor: clickable ? "pointer" : "default",
                  }}
                  title={
                    clickable
                      ? `${fmtAbsTsExact(r.timestamp_hour)} — click to scrub iterations`
                      : fmtAbsTsExact(r.timestamp_hour)
                  }
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

      {selectedId !== null && (
        <div style={{ marginTop: 16 }}>
          {detail.state.status === "ok" ? (
            <PerIterationScrubber detail={detail.state.data.event} />
          ) : detail.state.status === "loading" && detail.state.previous ? (
            <PerIterationScrubber detail={detail.state.previous.event} />
          ) : detail.state.status === "loading" ? (
            <ScrubberSkeleton />
          ) : detail.state.status === "error" ? (
            <ScrubberError message={detail.state.error.message} />
          ) : null}
        </div>
      )}
    </>
  );
}

// ── Per-iteration scrubber ────────────────────────────────────────────

function PerIterationScrubber({ detail }: { detail: EventDetail }) {
  const pit = detail.per_iteration;

  if (!pit || pit.error_history.length === 0) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          Per-iteration trajectory
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.6 }}>
          This run was recorded by an older library version (
          <span className="mono" style={{ color: "var(--text-2)" }}>
            {detail.library_version}
          </span>
          ) that didn't emit per-iteration data. Upgrade to{" "}
          <span className="mono" style={{ color: "var(--text-1)" }}>
            loopgain &gt;= 0.1.6
          </span>{" "}
          to enable the scrubber.
        </div>
      </div>
    );
  }

  return <PerIterationScrubberBody detail={detail} pit={pit} />;
}

function PerIterationScrubberBody({
  detail,
  pit,
}: {
  detail: EventDetail;
  pit: PerIteration;
}) {
  // Slider position is the iteration index into error_history (1-based for
  // display). Default to the last iteration so the user lands on the final
  // state. Reset whenever the selected event changes.
  const lastIdx = pit.error_history.length - 1;
  const [idx, setIdx] = useState<number>(lastIdx);
  useEffect(() => {
    setIdx(pit.error_history.length - 1);
  }, [detail.id, pit.error_history.length]);

  const currentError = pit.error_history[idx] ?? 0;
  // convergence_profile is one shorter than error_history (no Aβ for the
  // first observation). Aβ at iteration k corresponds to convergence_profile[k-1].
  const currentAB = idx >= 1 ? pit.convergence_profile[idx - 1] ?? null : null;
  const errorMin = Math.min(...pit.error_history);
  const errorMax = Math.max(...pit.error_history);
  const abMax = pit.convergence_profile.length
    ? Math.max(...pit.convergence_profile)
    : 0;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <div className="label">Per-iteration trajectory</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
          run id <span style={{ color: "var(--text-1)" }}>{detail.id}</span>
          {pit.truncated && (
            <span style={{ color: "var(--band-stall)", marginLeft: 8 }}>
              truncated to {pit.cap}
            </span>
          )}
        </div>
      </div>

      <TrajectoryChart pit={pit} hover={idx} />

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0 14px",
          alignItems: "center",
        }}
      >
        <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
          iter <span style={{ color: "var(--text-1)" }}>{idx + 1}</span> of{" "}
          {pit.error_history.length}
        </div>
        <input
          type="range"
          min={0}
          max={lastIdx}
          step={1}
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--accent)" }}
          aria-label="Scrub iteration index"
        />
      </div>

      <div
        className="mono"
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          fontSize: 11,
        }}
      >
        <KPI
          label="error magnitude"
          value={currentError.toExponential(2)}
          sub={`min ${errorMin.toExponential(1)} · max ${errorMax.toExponential(1)}`}
        />
        <KPI
          label="Aβ at this iter"
          value={currentAB == null ? "—" : currentAB.toFixed(3)}
          sub={
            currentAB == null
              ? "no Aβ for first obs"
              : `peak Aβ ${abMax.toFixed(3)}`
          }
        />
        <KPI
          label="loop outcome"
          value={outcomeLabel(detail.outcome)}
          sub={`${detail.iterations_used} iters used`}
        />
      </div>
    </div>
  );
}

function ScrubberSkeleton() {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="label" style={{ marginBottom: 8 }}>
        Per-iteration trajectory
      </div>
      <div
        style={{
          height: 220,
          background:
            "linear-gradient(90deg, var(--surf-2) 0%, var(--surf-3) 50%, var(--surf-2) 100%)",
          borderRadius: 4,
          opacity: 0.5,
        }}
      />
    </div>
  );
}

function ScrubberError({ message }: { message: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        className="label"
        style={{ marginBottom: 8, color: "var(--band-osc)" }}
      >
        Per-iteration trajectory · failed to load
      </div>
      <div className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
        {message}
      </div>
    </div>
  );
}

// The .label class applies text-transform: uppercase site-wide. β.toUpperCase()
// is the Greek capital beta U+0392, which renders visually as "B" in most
// fonts — so "Aβ" gets shown as "AB" in any uppercase KPI label. This
// wrapper opts a span back out of the uppercase transform so the lowercase
// β stays visible.
function NoCase({ children }: { children: ReactNode }) {
  return <span style={{ textTransform: "none" }}>{children}</span>;
}

