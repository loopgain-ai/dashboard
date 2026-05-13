import type { Bucket } from "../../lib/stats";
import { BAND_COLOR, bandFromAB } from "../../lib/bands";

interface RefLine {
  at: number;
  label: string;
  color?: string;
  anchor?: "start" | "middle" | "end";
}

interface Props {
  buckets: ReadonlyArray<Bucket>;
  width?: number;
  height?: number;
  refs?: ReadonlyArray<RefLine>;
  xAxisLabel?: string;
  onHover?: (b: Bucket | null, pos?: { x: number; y: number }) => void;
}

const PAD = { l: 44, r: 18, t: 18, b: 30 } as const;

export function Histogram({
  buckets,
  width = 720,
  height = 240,
  refs = [],
  xAxisLabel = "GM = 1 / max(Aβ_SMOOTH)",
  onHover,
}: Props) {
  if (buckets.length === 0) return null;
  const innerW = width - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const barW = innerW / buckets.length;
  const minX = buckets[0]!.lo;
  const maxX = buckets[buckets.length - 1]!.hi;
  const xOf = (v: number): number => PAD.l + ((v - minX) / (maxX - minX)) * innerW;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[0, Math.round(maxCount * 0.5), maxCount].map((t) => (
        <g key={t}>
          <line
            x1={PAD.l}
            x2={width - PAD.r}
            y1={PAD.t + innerH - (t / maxCount) * innerH}
            y2={PAD.t + innerH - (t / maxCount) * innerH}
            stroke="var(--border)"
            strokeDasharray="2 3"
          />
          <text
            x={PAD.l - 6}
            y={PAD.t + innerH - (t / maxCount) * innerH + 3}
            textAnchor="end"
            fontFamily="var(--mono)"
            fontSize="10"
            fill="var(--text-3)"
          >
            {t}
          </text>
        </g>
      ))}
      {buckets.map((b, i) => {
        const h = (b.count / maxCount) * innerH;
        const x = PAD.l + i * barW;
        const y = PAD.t + innerH - h;
        const mid = (b.lo + b.hi) / 2;
        const band = bandFromAB(1 / mid);
        const color = BAND_COLOR[band];
        return (
          <rect
            key={i}
            x={x + 1}
            y={y}
            width={barW - 2}
            height={h}
            fill={color}
            fillOpacity={0.65}
            onMouseEnter={() => onHover && onHover(b, { x: x + barW / 2, y })}
            onMouseLeave={() => onHover && onHover(null)}
            style={{ cursor: "pointer" }}
          />
        );
      })}
      {refs.map((r, i) => {
        const anchor = r.anchor ?? "middle";
        const dx = anchor === "end" ? -4 : anchor === "start" ? 4 : 0;
        return (
          <g key={i}>
            <line
              x1={xOf(r.at)}
              x2={xOf(r.at)}
              y1={PAD.t - 4}
              y2={PAD.t + innerH}
              stroke="var(--text-2)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.9"
            />
            <text
              x={xOf(r.at) + dx}
              y={PAD.t - 6}
              textAnchor={anchor}
              fontFamily="var(--mono)"
              fontSize="10"
              fill={r.color ?? "var(--text-2)"}
            >
              {r.label}
            </text>
          </g>
        );
      })}
      {[0.6, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0]
        .filter((t) => t >= minX && t <= maxX)
        .map((t) => (
          <text
            key={t}
            x={xOf(t)}
            y={height - PAD.b + 14}
            textAnchor="middle"
            fontFamily="var(--mono)"
            fontSize="10"
            fill="var(--text-3)"
          >
            {t.toFixed(1)}
          </text>
        ))}
      <text
        x={PAD.l + innerW / 2}
        y={height - 4}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="10"
        fill="var(--text-3)"
        letterSpacing="0.05em"
      >
        {xAxisLabel}
      </text>
    </svg>
  );
}
