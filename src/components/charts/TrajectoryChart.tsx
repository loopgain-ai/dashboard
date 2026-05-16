// SVG line chart of error_history (log scale) + convergence_profile (linear),
// with an optional vertical scrubber cursor.
//
// Used by LoopDetail (with scrubber) and Overview's Latest-run trajectory
// card (no scrubber — read-only preview).

import type { PerIteration } from "../../types";

interface Props {
  pit: PerIteration;
  /** Iteration index to mark with a cursor. Omit for a read-only chart. */
  hover?: number;
  /** SVG viewBox height in px. Width is fixed at 1080. Default 220. */
  height?: number;
}

export function TrajectoryChart({ pit, hover, height = 220 }: Props) {
  const width = 1080;
  const pad = { left: 56, right: 56, top: 14, bottom: 26 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const errs = pit.error_history;
  const ab = pit.convergence_profile;
  const n = errs.length;

  // Error y-axis: log10. Guard against zero/negative.
  const safeErrs = errs.map((v) => Math.max(v, 1e-12));
  const errMaxLog = Math.log10(Math.max(...safeErrs));
  const errMinLog = Math.log10(Math.min(...safeErrs));
  const errSpan = Math.max(0.5, errMaxLog - errMinLog);

  // Aβ y-axis: linear, 0..max(1.2, max_ab + 0.1).
  const abMax = ab.length ? Math.max(1.2, Math.max(...ab) + 0.1) : 1.2;

  const x = (i: number) =>
    pad.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yErr = (v: number) =>
    pad.top + plotH - ((Math.log10(Math.max(v, 1e-12)) - errMinLog) / errSpan) * plotH;
  const yAB = (v: number) => pad.top + plotH - (v / abMax) * plotH;

  const errPath = errs.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${yErr(v)}`).join(" ");
  // Aβ at iteration k corresponds to ab[k-1]; render starting at x(1).
  const abPath = ab
    .map((v, j) => `${j === 0 ? "M" : "L"}${x(j + 1)},${yAB(v)}`)
    .join(" ");

  const showCursor = hover != null && hover >= 0 && hover < n;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* Reference line at Aβ = 1 (oscillation boundary) */}
      <line
        x1={pad.left}
        x2={pad.left + plotW}
        y1={yAB(1)}
        y2={yAB(1)}
        stroke="var(--band-osc)"
        strokeOpacity={0.3}
        strokeDasharray="4 4"
      />
      <text
        x={pad.left + plotW + 6}
        y={yAB(1) + 4}
        fill="var(--band-osc)"
        fontSize="10"
        fontFamily="var(--mono)"
      >
        Aβ=1
      </text>

      {/* Aβ line (right axis) */}
      {ab.length > 0 && (
        <path d={abPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      )}

      {/* Error line (left axis) */}
      <path d={errPath} fill="none" stroke="var(--band-conv)" strokeWidth={1.75} />

      {showCursor && (
        <>
          <line
            x1={x(hover!)}
            x2={x(hover!)}
            y1={pad.top}
            y2={pad.top + plotH}
            stroke="var(--text-1)"
            strokeOpacity={0.5}
            strokeWidth={1}
          />
          <circle
            cx={x(hover!)}
            cy={yErr(safeErrs[hover!] ?? 0)}
            r={3.5}
            fill="var(--band-conv)"
          />
          {hover! >= 1 && ab[hover! - 1] != null && (
            <circle
              cx={x(hover!)}
              cy={yAB(ab[hover! - 1]!)}
              r={3.5}
              fill="var(--accent)"
            />
          )}
        </>
      )}

      {/* Axis labels */}
      <text
        x={pad.left - 8}
        y={pad.top + 6}
        fill="var(--band-conv)"
        fontSize="10"
        fontFamily="var(--mono)"
        textAnchor="end"
      >
        log error
      </text>
      <text
        x={pad.left + plotW + 6}
        y={pad.top + 6}
        fill="var(--accent)"
        fontSize="10"
        fontFamily="var(--mono)"
      >
        Aβ
      </text>
      <text
        x={pad.left + plotW / 2}
        y={height - 6}
        fill="var(--text-3)"
        fontSize="10.5"
        fontFamily="var(--mono)"
        textAnchor="middle"
      >
        iteration index
      </text>
    </svg>
  );
}
