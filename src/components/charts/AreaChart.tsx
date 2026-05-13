// Stacked area chart for time-series. Each `field` becomes a stacked layer.

interface DataPoint {
  [k: string]: number;
}

interface Props {
  data: ReadonlyArray<DataPoint>;
  width?: number;
  height?: number;
  fields: ReadonlyArray<string>;
  colors: ReadonlyArray<string>;
  xLabel?: (i: number, n: number) => string;
  yPrefix?: string;
}

const PAD = { l: 52, r: 18, t: 12, b: 26 } as const;

export function AreaChart({
  data,
  width = 720,
  height = 200,
  fields,
  colors,
  xLabel,
  yPrefix = "$",
}: Props) {
  if (data.length === 0 || fields.length === 0) return null;
  const innerW = width - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;
  const maxStacked =
    Math.max(...data.map((d) => fields.reduce((s, f) => s + (d[f] ?? 0), 0))) * 1.15;
  const max = maxStacked || 1;
  const xOf = (i: number): number =>
    data.length === 1 ? PAD.l + innerW / 2 : PAD.l + (i / (data.length - 1)) * innerW;
  const yOf = (v: number): number => PAD.t + innerH - (v / max) * innerH;

  const stacks = fields.map(() => new Array(data.length).fill(0) as number[]);
  for (let i = 0; i < data.length; i++) {
    let acc = 0;
    fields.forEach((f, fi) => {
      stacks[fi]![i] = acc;
      acc += data[i]![f] ?? 0;
    });
  }

  function areaPath(fi: number): string {
    const top = data.map(
      (d, i) => `${xOf(i).toFixed(2)} ${yOf(stacks[fi]![i]! + (d[fields[fi]!] ?? 0)).toFixed(2)}`,
    );
    const bot = data
      .map((_, i) => `${xOf(i).toFixed(2)} ${yOf(stacks[fi]![i]!).toFixed(2)}`)
      .reverse();
    return "M " + top.join(" L ") + " L " + bot.join(" L ") + " Z";
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[0, 0.5, 1].map((p) => {
        const v = max * p;
        return (
          <g key={p}>
            <line
              x1={PAD.l}
              x2={PAD.l + innerW}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="var(--border)"
              strokeDasharray="2 3"
            />
            <text
              x={PAD.l - 6}
              y={yOf(v) + 3}
              textAnchor="end"
              fontFamily="var(--mono)"
              fontSize="10"
              fill="var(--text-3)"
            >
              {yPrefix}
              {v.toFixed(0)}
            </text>
          </g>
        );
      })}
      {fields.map((f, fi) => (
        <path
          key={f}
          d={areaPath(fi)}
          fill={colors[fi] ?? "var(--accent)"}
          fillOpacity="0.18"
          stroke={colors[fi] ?? "var(--accent)"}
          strokeWidth="1.25"
        />
      ))}
      {xLabel &&
        data.map((_, i) =>
          i % Math.max(1, Math.floor(data.length / 6)) === 0 ? (
            <text
              key={i}
              x={xOf(i)}
              y={height - 6}
              textAnchor="middle"
              fontFamily="var(--mono)"
              fontSize="10"
              fill="var(--text-3)"
            >
              {xLabel(i, data.length)}
            </text>
          ) : null,
        )}
    </svg>
  );
}
