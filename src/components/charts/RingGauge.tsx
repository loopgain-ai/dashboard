// Ring gauge: value mapped to a 270° arc colored by the 5 Aβ bands.

interface Props {
  value: number;
  size?: number;
  sub?: string;
}

export function RingGauge({ value, size = 220, sub }: Props) {
  const clamped = Math.max(0, Math.min(1.4, value));
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

  const bands = [
    { from: 0, to: 0.3, color: "var(--band-fast)" },
    { from: 0.3, to: 0.85, color: "var(--band-conv)" },
    { from: 0.85, to: 0.95, color: "var(--band-stall)" },
    { from: 0.95, to: 1.05, color: "var(--band-osc)" },
    { from: 1.05, to: 1.4, color: "var(--band-div)" },
  ] as const;

  const toAng = (v: number): number => startA + (v / 1.4) * span;
  const indA = toAng(clamped);
  const indX = cx + r * Math.cos(indA);
  const indY = cy + r * Math.sin(indA);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
    >
      <path d={arcPath(startA, endA)} stroke="var(--surf-3)" strokeWidth="10" fill="none" />
      {bands.map((b, i) => (
        <path
          key={i}
          d={arcPath(toAng(b.from), toAng(b.to))}
          stroke={b.color}
          strokeWidth="10"
          fill="none"
          strokeOpacity={value >= b.from ? 0.95 : 0.32}
        />
      ))}
      {[0.3, 0.85, 0.95, 1.05].map((t, i) => {
        const a = toAng(t);
        const x1 = cx + (r - 12) * Math.cos(a);
        const y1 = cy + (r - 12) * Math.sin(a);
        const x2 = cx + (r + 6) * Math.cos(a);
        const y2 = cy + (r + 6) * Math.sin(a);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border-2)" strokeWidth="1" />;
      })}
      <circle cx={indX} cy={indY} r="6" fill="var(--bg-0)" stroke="var(--text-1)" strokeWidth="1.5" />
      <text
        x={cx}
        y={cy - 38}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="11"
        fill="var(--text-3)"
        letterSpacing="0.06em"
      >
        Aβ_MEDIAN
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
        {value.toFixed(3)}
      </text>
      {sub && (
        <text x={cx} y={cy + 46} textAnchor="middle" fontFamily="var(--sans)" fontSize="11" fill="var(--text-3)">
          {sub}
        </text>
      )}
    </svg>
  );
}
