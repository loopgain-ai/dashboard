// OutcomeDistGauge — a ring gauge whose bands are proportionally sized
// to outcome counts, not fixed thresholds.
//
// Unlike a threshold gauge (where bands have static boundaries like
// 0-50 red / 50-80 amber / 80-100 green and the colors imply a quality
// interpretation), the bands here ARE the outcome distribution. Each
// outcome category (DIV, OSC, STALL, CONV) occupies an arc segment
// proportional to its share of total runs, colored by the same palette
// the strip below uses — so the gauge and strip are showing the same
// data in two complementary renders (visual ring + numeric row).
//
// The indicator dot represents a separate scalar value (typically %
// CONVERGED) overlaid on the same [0, 100] axis. For outcomes ordered
// worst→best on the arc (DIV → OSC → STALL → CONV), the indicator
// naturally lands inside the CONV segment iff convergence rate exceeds
// the cumulative share of non-CONV outcomes. That's the "majority
// converged" signal — no thresholds needed.

interface OutcomeSlice {
  /** Category label (e.g. "DIV", "OSC", "CONV"). Currently unused in
   *  the render but kept on the prop so callers can pass the same
   *  array shape they use elsewhere; could surface as a tooltip later. */
  label: string;
  /** Number of runs in this category. Zero-count slices are skipped. */
  count: number;
  /** Stroke color for this slice's arc segment. */
  color: string;
}

interface Props {
  /** Outcome slices in left-to-right arc order — worst outcome first. */
  slices: ReadonlyArray<OutcomeSlice>;
  /** Headline value on the [0, 100] axis (typically % CONVERGED). */
  value: number;
  /** Small uppercase label above the center number. */
  valueLabel: string;
  /** Optional descriptive sub below the center number. */
  valueSub?: string;
  size?: number;
  /** Optional formatter for the center number; defaults to "NN.N%". */
  format?: (v: number) => string;
}

export function OutcomeDistGauge({
  slices,
  value,
  valueLabel,
  valueSub,
  size = 220,
  format,
}: Props) {
  const total = slices.reduce((s, x) => s + x.count, 0);
  // Avoid div-by-zero on empty tenants — render an empty background arc
  // with the indicator pinned at 0.
  const safeTotal = total > 0 ? total : 1;
  const fmt = format ?? ((v: number) => `${v.toFixed(1)}%`);

  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const startA = Math.PI * 0.75;
  const endA = Math.PI * 0.25 + Math.PI * 2;
  const span = endA - startA;

  function arcPath(from: number, to: number): string {
    const x1 = cx + r * Math.cos(from);
    const y1 = cy + r * Math.sin(from);
    const x2 = cx + r * Math.cos(to);
    const y2 = cy + r * Math.sin(to);
    const large = to - from > Math.PI ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  // Convert a value on [0, 100] to an angle on the arc.
  const toAng = (v: number): number =>
    startA + (Math.max(0, Math.min(100, v)) / 100) * span;

  // Indicator position (the % CONVERGED dot).
  const indA = toAng(value);
  const indX = cx + r * Math.cos(indA);
  const indY = cy + r * Math.sin(indA);

  // Walk through slices computing cumulative arc ranges on the [0, 100]
  // axis. Each slice spans (cum/total)*100 → ((cum+count)/total)*100.
  let cum = 0;
  const arcs = slices.map((slice) => {
    const startPct = (cum / safeTotal) * 100;
    cum += slice.count;
    const endPct = (cum / safeTotal) * 100;
    return { ...slice, startPct, endPct };
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
    >
      {/* Background arc — surface color, full sweep. Shows through for
          any uncategorized fraction (in practice the slices should sum
          to total, so this is mostly visible only on an empty tenant). */}
      <path
        d={arcPath(startA, endA)}
        stroke="var(--surf-3)"
        strokeWidth="14"
        fill="none"
      />
      {/* Proportional outcome-distribution arcs. Zero-count slices
          produce zero-width arcs, which SVG renders as nothing — no
          guard needed beyond the .filter call in the caller. */}
      {arcs.map((a, i) =>
        a.count > 0 ? (
          <path
            key={i}
            d={arcPath(toAng(a.startPct), toAng(a.endPct))}
            stroke={a.color}
            strokeWidth="14"
            fill="none"
            strokeOpacity="1"
          />
        ) : null,
      )}
      {/* Indicator dot at the value position on the same axis. Same
          visual as RingGauge's dot so it reads as a familiar gauge
          marker, not a chart annotation. */}
      <circle
        cx={indX}
        cy={indY}
        r="6"
        fill="var(--bg-0)"
        stroke="var(--text-1)"
        strokeWidth="1.5"
      />
      <text
        x={cx}
        y={cy - 38}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="11"
        fill="var(--text-3)"
        letterSpacing="0.06em"
      >
        {valueLabel}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="42"
        fontWeight="500"
        fill="var(--text-1)"
        letterSpacing="-0.02em"
      >
        {fmt(value)}
      </text>
      {valueSub && (
        <text
          x={cx}
          y={cy + 46}
          textAnchor="middle"
          fontFamily="var(--sans)"
          fontSize="11"
          fill="var(--text-3)"
        >
          {valueSub}
        </text>
      )}
    </svg>
  );
}
