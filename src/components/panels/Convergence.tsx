// Panel 2 — Convergence.
//
// Leads with the iterations-to-best distribution (best_index + 1 per event)
// and the "no static cap is both cheap and safe" argument — the standing
// rebuttal to "why not just lower max_iter?". Mirrors loopgain-verify
// `thesis.iteration_waste`. Below it: the Aβ_median-over-time trajectory
// with band thresholds + rolling median, and the State classifier card.
// Optional workload filter; optional sinceHours window override.

import { useMemo, useState } from "react";
import { useEvents, useProfiles, useStats } from "../../lib/data-hooks";
import { PanelHeader, Chip, StatePill } from "../primitives";
import { ConvergenceOverTime, HBar } from "../charts";
import { Loaded } from "./PanelState";
import { median } from "../../lib/stats";
import { fmtInt, fmtPct } from "../../lib/format";
import {
  FIXED_CAP_BASELINE,
  falseStopsAtCap,
  iterationWasteFleet,
  iterationWasteSample,
} from "../../lib/iteration-waste";
import type { LoopEvent, ProfileEvent, StatsResponse } from "../../types";

interface Props {
  pollMs?: number;
  sinceHours?: number;
}

export function Convergence({ pollMs, sinceHours }: Props) {
  const stats = useStats({ pollMs });
  const events = useEvents({ pollMs, sinceHours });
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
            <PanelHeader title="Convergence" />

            <Loaded state={events.state}>
              {(eventsData) => (
                <IterationsToBest events={eventsData.events} stats={statsData} />
              )}
            </Loaded>

            <PanelHeader
              title="Aβ trajectory"
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
                  abMedian={statsData.aggregates?.ab_median ?? 0}
                  abP99={statsData.aggregates?.ab_p99 ?? 0}
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

// Iterations-to-best lead section — the "no static cap is both cheap and
// safe" argument, told entirely from live data. The fleet headline numbers
// come from the receiver's served best_index aggregates (proven == raw by
// loopgain-verify `dash.live_iteration_waste`); the distribution + medians +
// false-stop counts come from the /events sample. All display math lives in
// lib/iteration-waste.ts so loopgain-verify can pin it.
function IterationsToBest({
  events,
  stats,
}: {
  events: ReadonlyArray<LoopEvent>;
  stats: StatsResponse;
}) {
  const t = stats.totals;
  const hasFleet =
    t != null &&
    typeof t.event_count_with_best_index === "number" &&
    t.event_count_with_best_index > 0;

  const sample = useMemo(() => iterationWasteSample(events), [events]);
  const cap1FalseStop = useMemo(() => falseStopsAtCap(events, 1), [events]);
  const cap2FalseStop = useMemo(() => falseStopsAtCap(events, 2), [events]);

  if (!hasFleet) {
    return (
      <div
        className="card"
        style={{ padding: 18, marginBottom: 16, color: "var(--text-3)", fontSize: 12 }}
      >
        Iterations-to-best is unavailable — this tenant&apos;s receiver predates
        the <span className="mono">best_index</span> column (v3.5+). Loops ingested
        after the upgrade will populate it.
      </div>
    );
  }

  const fleet = iterationWasteFleet({
    event_count_with_best_index: t!.event_count_with_best_index!,
    event_count_best_at_iter1: t!.event_count_best_at_iter1 ?? 0,
    total_iterations_past_best: t!.total_iterations_past_best ?? 0,
    total_savings: t!.total_savings,
  });

  const distMax = Math.max(...sample.distribution.map((d) => d.count), 1);

  return (
    <>
      {/* Hero: where best lands + the headline share */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 4,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
            Where loops reach their best output
          </h3>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
            best_index + 1 · {fmtInt(fleet.withBestIndex)} loops
          </span>
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-3)",
            lineHeight: 1.5,
            maxWidth: 820,
            marginBottom: 16,
          }}
        >
          Each loop&apos;s best output (lowest error) lands at a different iteration.
          You can&apos;t know which in advance — so no single static{" "}
          <span className="mono">max_iter</span> is both cheap and safe.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 0.8fr) 1.2fr",
            gap: 28,
            alignItems: "center",
          }}
        >
          <div>
            <div
              className="mono"
              style={{
                fontSize: 56,
                fontWeight: 500,
                letterSpacing: "-0.03em",
                color: "var(--band-conv)",
                lineHeight: 1,
              }}
            >
              {fmtPct(fleet.pctBestAtIter1)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8, maxWidth: 240, lineHeight: 1.45 }}>
              of loops reach their best on the first iteration — but{" "}
              <span style={{ color: "var(--text-1)" }}>{fmtInt(fleet.bestPastIter1)}</span>{" "}
              ({fmtPct(1 - fleet.pctBestAtIter1)}) only get there later, spanning up to
              iteration <span className="mono" style={{ color: "var(--text-1)" }}>{sample.maxIterationsToBest}</span>.
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 10 }}>
              Iterations to best · distribution
            </div>
            <HBar
              rows={sample.distribution.map((d) => ({
                label: `iter ${d.iter}`,
                value: d.count,
                color: d.iter === 1 ? "var(--band-conv)" : "var(--band-stall)",
              }))}
              max={distMax}
              valueFmt={(v) => fmtInt(v)}
            />
          </div>
        </div>
      </div>

      {/* The no-static-cap argument: two failure modes + LoopGain */}
      <div
        className="card"
        style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}
      >
        <div className="card-h">
          <h3>Why no static cap works</h3>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
            vs. the common max_iter={FIXED_CAP_BASELINE}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
        >
          {[
            {
              tone: "var(--band-osc)",
              head: "Cap too low",
              big: fmtInt(cap1FalseStop),
              bigSub: `loops (${fmtPct(cap1FalseStop / Math.max(fleet.withBestIndex, 1))})`,
              body: (
                <>
                  Stop at 1 iteration and you false-stop{" "}
                  <span style={{ color: "var(--text-1)" }}>{fmtInt(cap1FalseStop)}</span> loops
                  before their best — shipping a worse result. Even a cap of 2 still clips{" "}
                  <span style={{ color: "var(--text-1)" }}>{fmtInt(cap2FalseStop)}</span>.
                </>
              ),
            },
            {
              tone: "var(--band-stall)",
              head: "Cap too high",
              big: fmtInt(sample.fixedCapGrindMedian),
              bigSub: "median iters past best",
              body: (
                <>
                  The usual <span className="mono">max_iter={FIXED_CAP_BASELINE}</span> grinds a
                  median of{" "}
                  <span style={{ color: "var(--text-1)" }}>{fmtInt(sample.fixedCapGrindMedian)}</span>{" "}
                  iterations past best on the {fmtPct(fleet.pctBestAtIter1)} already done at iter 1
                  — <span style={{ color: "var(--text-1)" }}>{fmtInt(fleet.fixedCapGrindTotal)}</span>{" "}
                  wasted iterations, producing nothing better.
                </>
              ),
            },
            {
              tone: "var(--band-conv)",
              head: "LoopGain",
              big: fmtPct(fleet.grindEliminatedPct),
              bigSub: "of the grind eliminated",
              body: (
                <>
                  Runs a hair past best, then rolls back to it — median{" "}
                  <span style={{ color: "var(--text-1)" }}>{fmtInt(sample.lgGrindMedian)}</span>{" "}
                  iterations past best,{" "}
                  <span style={{ color: "var(--text-1)" }}>{fmtInt(fleet.lgGrindTotal)}</span> residual;
                  the {fmtInt(fleet.bestPastIter1)}-loop late-converging tail kept, the grind gone.
                </>
              ),
            },
          ].map((c, i) => (
            <div
              key={i}
              style={{
                padding: 18,
                borderLeft: i === 0 ? "none" : "1px solid var(--border)",
              }}
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
                {c.head}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  className="mono"
                  style={{ fontSize: 30, fontWeight: 500, color: "var(--text-1)", letterSpacing: "-0.02em" }}
                >
                  {c.big}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>{c.bigSub}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8, lineHeight: 1.5 }}>
                {c.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Aβ band classifier — maps a median Aβ value to the named band it falls in.
// Thresholds mirror the State classifier card below (0.3 / 0.85 / 0.95 / 1.05);
// used to subtitle the Median Aβ stat with the band it sits in, providing the
// at-a-glance "where does this fall" context the brief asked for.
function abBandLabel(ab: number): string {
  if (ab <= 0) return "no measurable runs";
  if (ab < 0.3) return "FAST_CONVERGE zone";
  if (ab < 0.85) return "CONVERGING zone";
  if (ab < 0.95) return "STALLING zone";
  if (ab < 1.05) return "OSCILLATING zone";
  return "DIVERGING zone";
}

function ConvergenceBody({
  events,
  totalEvents,
  abMedian,
  abP99,
  yMax,
  showTrend,
}: {
  events: ReadonlyArray<ProfileEvent>;
  totalEvents: number;
  abMedian: number;
  abP99: number;
  yMax: number;
  showTrend: boolean;
}) {
  // Rolling median over time — sliding window. For each daily timestamp
  // between min(ts) and max(ts), take the median of all measurable events
  // within ±half-window. Step + window sized to match the chart's actual
  // resolution: the X axis spans 30 days, so a daily step gives ~30
  // output points, plenty for a smooth-looking trend line without
  // pretending to hourly precision. A 3-day window averages over ~66
  // measurable events on the bench (~22/day × 3 days), which is enough
  // sample for a stable daily median.
  //
  // profile_median == 0 means TARGET_MET-at-iter-1 (no Aβ measured);
  // treat both null and zero as unmeasurable. Mirrors the receiver's
  // ab_median aggregate which excludes null profile_max.
  const rolling = useMemo(() => {
    if (!showTrend || events.length === 0) return [];
    const measurable = events
      .filter(
        (e): e is typeof e & { profile_median: number } =>
          typeof e.profile_median === "number" && e.profile_median > 0,
      )
      .map((e) => ({ ts: e.timestamp_hour, v: e.profile_median }))
      .sort((a, b) => a.ts - b.ts);
    if (measurable.length === 0) return [];

    const DAY_S = 24 * 3600;
    const WINDOW_S = 3 * DAY_S; // 3-day sliding window
    const STEP_S = DAY_S; // one output point per day
    const halfWindow = WINDOW_S / 2;
    const tMin = measurable[0]!.ts;
    const tMax = measurable[measurable.length - 1]!.ts;
    const out: Array<{ ts: number; median: number }> = [];

    // Two-pointer sweep — lo/hi index into `measurable` to mark the
    // events currently inside the [t-halfWindow, t+halfWindow] window.
    let lo = 0;
    let hi = 0;
    for (let t = tMin; t <= tMax; t += STEP_S) {
      const wLo = t - halfWindow;
      const wHi = t + halfWindow;
      while (lo < measurable.length && measurable[lo]!.ts < wLo) lo++;
      while (hi < measurable.length && measurable[hi]!.ts <= wHi) hi++;
      if (hi - lo === 0) continue;
      const window = measurable.slice(lo, hi).map((e) => e.v);
      const m = median(window);
      if (m != null) out.push({ ts: t, median: m });
    }
    return out;
  }, [events, showTrend]);

  const fleetMedian = useMemo(
    () =>
      median(
        events
          .map((e) => e.profile_median)
          .filter((v): v is number => typeof v === "number" && v > 0),
      ),
    [events],
  );

  return (
    <>
      {/* Aβ statistics · 30d — relocated here from Overview's KPI quad
          (2026-05-26 reframe). Overview now uses buyer-facing diverse
          signals; the Aβ population statistics live here where the State
          classifier card (below) provides the band-threshold context and
          the ≥2-iters methodology footnote can be stated plainly. */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
            Aβ statistics · 30d
          </h3>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
            tenant-wide aggregates · /v1/stats
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            marginTop: 4,
            lineHeight: 1.5,
            maxWidth: 820,
          }}
        >
          Aβ is the iteration-to-iteration loop-gain ratio. Computed only
          across runs with ≥2 iterations — runs that converged at iter 1
          (TARGET_MET immediately) have no Aβ measurement and are excluded
          from these statistics. See the State classifier below for the
          five band thresholds.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            marginTop: 14,
            borderTop: "1px solid var(--border)",
          }}
        >
          {[
            {
              label: "Median Aβ",
              value: abMedian.toFixed(2),
              sub: abMedian > 0 ? abBandLabel(abMedian) : "no measurable runs",
            },
            {
              label: "p99 Aβ",
              value: abP99.toFixed(2),
              sub: abP99 > 0 ? abBandLabel(abP99) + " · worst 1%" : "worst 1%",
            },
          ].map((k, i) => (
            <div
              key={i}
              style={{
                padding: 14,
                borderRight: i < 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {k.label}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 26,
                  fontWeight: 500,
                  color: "var(--text-1)",
                  marginTop: 6,
                  letterSpacing: "-0.02em",
                }}
              >
                {k.value}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4 }}>
                {k.sub}
              </div>
            </div>
          ))}
        </div>
      </div>

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
            { id: "FAST_CONVERGE" as const, range: "cumulative E ≤ 10%", desc: "Strong contraction, still improving. Continue; ETA predicted." },
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
