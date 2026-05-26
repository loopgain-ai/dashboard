// Outcome donut: proportional breakdown of loop terminal outcomes
// (CONV/OSC/DIV/STALL) as a 360° colored ring.
//
// Replaces the % CONVERGED gauge whose single-score framing invited the
// "shouldn't this be 100%?" misread from prospects looking at /benchmark.
// The donut shows that all outcomes are LoopGain doing work — converged
// loops stopped at the right iteration; oscillating loops were stopped
// with best-so-far rollback; diverging loops were aborted with rollback.
// No outcome implies failure.
//
// Visual style mirrors RingGauge's stroke-as-ring approach so the panel
// composition (center text + below-strip) reads consistently.

interface Slice {
  label: string;
  count: number;
  color: string;
}

interface Props {
  /** Slices rendered clockwise starting at 12 o'clock. */
  slices: ReadonlyArray<Slice>;
  /** Small caps label above the big number. */
  centerLabel: string;
  /** Big number rendered in the center of the donut. */
  centerValue: string;
  /** Optional small line below the big number. */
  centerSub?: string;
  size?: number;
}

export function OutcomeDonut({
  slices,
  centerLabel,
  centerValue,
  centerSub,
  size = 220,
}: Props) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const startA = -Math.PI / 2; // 12 o'clock

  // SVG arc command: M start A r r 0 large-arc sweep end. Sweep clockwise
  // (flag = 1); set large-arc when span > π so slices ≥ 180° render.
  function arcPath(from: number, to: number): string {
    const x1 = cx + r * Math.cos(from);
    const y1 = cy + r * Math.sin(from);
    const x2 = cx + r * Math.cos(to);
    const y2 = cy + r * Math.sin(to);
    const large = to - from > Math.PI ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  // Walk slices clockwise from 12 o'clock, accumulating angular offset.
  // Insert a small gap between adjacent slices so the boundaries read
  // clearly; skip the gap on single-slice (100%) and zero-count slices.
  const GAP = 0.02; // ~1.15° between slices
  let cursor = startA;
  const arcs: Array<{ from: number; to: number; color: string } | null> = slices.map((s) => {
    if (total === 0 || s.count === 0) return null;
    const span = (s.count / total) * Math.PI * 2;
    const useGap = slices.filter((x) => x.count > 0).length > 1;
    const from = cursor + (useGap ? GAP / 2 : 0);
    const to = cursor + span - (useGap ? GAP / 2 : 0);
    cursor += span;
    return { from, to, color: s.color };
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
    >
      {/* Background track — visible when no data or as a base ring */}
      <path
        d={arcPath(startA, startA + Math.PI * 2 - 0.001)}
        stroke="var(--surf-3)"
        strokeWidth="14"
        fill="none"
      />
      {/* Colored slices */}
      {arcs.map((a, i) =>
        a ? (
          <path
            key={i}
            d={arcPath(a.from, a.to)}
            stroke={a.color}
            strokeWidth="14"
            strokeLinecap="butt"
            fill="none"
          />
        ) : null,
      )}
      {/* Center text stack */}
      <text
        x={cx}
        y={cy - 22}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="10"
        fill="var(--text-3)"
        letterSpacing="0.08em"
      >
        {centerLabel}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="34"
        fontWeight="500"
        fill="var(--text-1)"
        letterSpacing="-0.02em"
      >
        {centerValue}
      </text>
      {centerSub && (
        <text
          x={cx}
          y={cy + 38}
          textAnchor="middle"
          fontFamily="var(--sans)"
          fontSize="11"
          fill="var(--text-3)"
        >
          {centerSub}
        </text>
      )}
    </svg>
  );
}
