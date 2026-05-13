// Horizontal bar chart with category labels. Used for waste-by-workload.

interface Row {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  rows: ReadonlyArray<Row>;
  valueFmt?: (v: number) => string;
  max?: number;
}

export function HBar({ rows, valueFmt = (v) => String(v), max }: Props) {
  if (rows.length === 0) {
    return (
      <div style={{ color: "var(--text-3)", fontSize: 12, padding: "8px 0" }}>
        no data
      </div>
    );
  }
  const m = max ?? Math.max(...rows.map((r) => r.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) 1fr 80px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--mono)",
            }}
            title={r.label}
          >
            {r.label}
          </div>
          <div
            style={{
              height: 12,
              background: "var(--surf-2)",
              borderRadius: 2,
              position: "relative",
            }}
          >
            <div
              style={{
                width: `${m > 0 ? (r.value / m) * 100 : 0}%`,
                height: "100%",
                background: r.color ?? "var(--accent)",
                opacity: 0.85,
                borderRadius: 2,
              }}
            />
          </div>
          <div
            className="mono"
            style={{ fontSize: 11.5, color: "var(--text-1)", textAlign: "right" }}
          >
            {valueFmt(r.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
