// Convergence Profiles chart.
//
// Reshaped from the prototype's per-iteration version: the receiver schema
// only stores summary stats per run (profile_min/median/max), not the full
// per-iteration trajectory. So instead of plotting Aβ vs. iteration index,
// we plot per-event profile_median vs. time. Background band thresholds
// are still meaningful because they partition the same Aβ continuum.

import { useMemo } from "react";
import { BAND_COLOR, bandFromProfileEvent } from "../../lib/bands";
import type { ProfileEvent } from "../../types";

interface Props {
  events: ReadonlyArray<ProfileEvent>;
  rollingMedian: ReadonlyArray<{ ts: number; median: number }>;
  width?: number;
  height?: number;
  yMax?: number;
}

const PAD = { l: 52, r: 24, t: 18, b: 32 } as const;

export function ConvergenceOverTime({
  events,
  rollingMedian,
  width = 1080,
  height = 400,
  yMax = 1.6,
}: Props) {
  const W = width;
  const H = height;
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const yMin = 0.08;
  const logYMin = Math.log10(yMin);
  const logYMax = Math.log10(yMax);

  const xExtent = useMemo<[number, number] | null>(() => {
    if (events.length === 0 && rollingMedian.length === 0) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of events) {
      if (e.timestamp_hour < lo) lo = e.timestamp_hour;
      if (e.timestamp_hour > hi) hi = e.timestamp_hour;
    }
    for (const p of rollingMedian) {
      if (p.ts < lo) lo = p.ts;
      if (p.ts > hi) hi = p.ts;
    }
    if (lo === hi) {
      lo = lo - 3600;
      hi = hi + 3600;
    }
    return [lo, hi];
  }, [events, rollingMedian]);

  if (!xExtent) {
    return (
      <div
        style={{
          width: "100%",
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-3)",
          fontSize: 12,
          fontFamily: "var(--mono)",
        }}
      >
        no profile events in window
      </div>
    );
  }

  const [xLo, xHi] = xExtent;
  const xOf = (ts: number): number => PAD.l + ((ts - xLo) / (xHi - xLo)) * innerW;
  const yOf = (v: number): number =>
    PAD.t + (1 - (Math.log10(Math.max(yMin, v)) - logYMin) / (logYMax - logYMin)) * innerH;

  const bands = [
    { from: 0, to: 0.3, color: "var(--band-fast)", label: "FAST_CONVERGE" },
    { from: 0.3, to: 0.85, color: "var(--band-conv)", label: "CONVERGING" },
    { from: 0.85, to: 0.95, color: "var(--band-stall)", label: "STALLING" },
    { from: 0.95, to: 1.05, color: "var(--band-osc)", label: "OSCILLATING" },
    { from: 1.05, to: yMax, color: "var(--band-div)", label: "DIVERGING" },
  ] as const;

  const yTicks = [0.1, 0.3, 0.85, 0.95, 1.05, 1.5].filter((t) => t <= yMax);

  // Build x-axis ticks: ~6 evenly-spaced timestamps across the range.
  const N_TICKS = 6;
  const xTicks = Array.from({ length: N_TICKS }, (_, i) => xLo + (i / (N_TICKS - 1)) * (xHi - xLo));

  function fmtTick(ts: number): string {
    const d = new Date(ts * 1000);
    const days = (xHi - xLo) / 86400;
    if (days < 2) {
      return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleString(undefined, { month: "short", day: "numeric" });
  }

  const trendPath =
    rollingMedian.length > 1
      ? "M " +
        rollingMedian
          .map((p) => `${xOf(p.ts).toFixed(2)} ${yOf(p.median).toFixed(2)}`)
          .join(" L ")
      : null;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {bands.map((b, i) => (
        <rect
          key={i}
          x={PAD.l}
          width={innerW}
          y={yOf(b.to)}
          height={yOf(b.from) - yOf(b.to)}
          fill={b.color}
          fillOpacity="0.045"
        />
      ))}
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={yOf(t)}
            y2={yOf(t)}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray={t === 0.85 || t === 0.95 || t === 1.05 ? "0" : "2 3"}
          />
          <text
            x={PAD.l - 8}
            y={yOf(t) + 3}
            textAnchor="end"
            fontFamily="var(--mono)"
            fontSize="10"
            fill="var(--text-3)"
          >
            {t.toFixed(2)}
          </text>
        </g>
      ))}
      {bands.map((b, i) => {
        const mid = (yOf(b.from) + yOf(b.to)) / 2;
        return (
          <text
            key={i}
            x={W - PAD.r - 4}
            y={mid + 3}
            textAnchor="end"
            fontFamily="var(--mono)"
            fontSize="9"
            letterSpacing="0.04em"
            fill={b.color}
            opacity="0.75"
          >
            {b.label}
          </text>
        );
      })}
      {xTicks.map((t, i) => (
        <text
          key={i}
          x={xOf(t)}
          y={H - PAD.b + 16}
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontSize="10"
          fill="var(--text-3)"
        >
          {fmtTick(t)}
        </text>
      ))}
      <text
        x={PAD.l - 40}
        y={PAD.t + innerH / 2}
        transform={`rotate(-90 ${PAD.l - 40} ${PAD.t + innerH / 2})`}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="10"
        fill="var(--text-3)"
        letterSpacing="0.05em"
      >
        Aβ_MEDIAN (log)
      </text>
      <text
        x={PAD.l + innerW / 2}
        y={H - 4}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="10"
        fill="var(--text-3)"
        letterSpacing="0.05em"
      >
        TIME
      </text>
      {/* Rolling median renders BEFORE the points so the points sit on top.
          30% stroke opacity so the trend stays readable without competing
          with the band-colored data. */}
      {trendPath && (
        <path
          d={trendPath}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.3}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {events.map((e, i) => {
        // profile_median == 0 means TARGET_MET-at-iter-1 (no Aβ was
        // measured) — the receiver reports these with literal 0 or
        // null; both semantically mean "unmeasurable." Skip both,
        // otherwise the chart paints a dense bottom band of false
        // y=0 points and the rolling median bounces wildly.
        if (e.profile_median == null || e.profile_median <= 0) return null;
        const band = bandFromProfileEvent(e);
        return (
          <circle
            key={i}
            cx={xOf(e.timestamp_hour)}
            cy={yOf(e.profile_median)}
            r={2.5}
            fill={BAND_COLOR[band]}
            fillOpacity={0.55}
          />
        );
      })}
    </svg>
  );
}
