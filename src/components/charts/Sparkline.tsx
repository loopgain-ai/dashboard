interface Props {
  data: ReadonlyArray<number>;
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  strokeWidth?: number;
  responsive?: boolean;
}

export function Sparkline({
  data,
  width = 120,
  height = 30,
  color = "var(--accent)",
  fill = true,
  strokeWidth = 1.25,
  responsive = false,
}: Props) {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const n = data.length;
  const points = data.map((v, i) => {
    const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y] as const;
  });
  const path =
    "M " + points.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ");
  const area = path + ` L ${width} ${height} L 0 ${height} Z`;
  const svgProps = responsive
    ? {
        width: "100%" as const,
        height,
        viewBox: `0 0 ${width} ${height}`,
        preserveAspectRatio: "none" as const,
      }
    : { width, height };
  return (
    <svg {...svgProps} style={{ display: "block" }}>
      {fill && <path d={area} fill={color} fillOpacity="0.1" />}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
