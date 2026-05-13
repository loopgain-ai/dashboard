interface Props {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number;
  deltaGood?: boolean;
  mono?: boolean;
  accent?: string;
}

export function KPI({ label, value, sub, delta, deltaGood, mono = true, accent }: Props) {
  const color =
    delta == null
      ? "var(--text-3)"
      : deltaGood
      ? "var(--band-conv)"
      : "var(--band-osc)";
  const arrow = delta == null ? "" : delta >= 0 ? "↑" : "↓";
  return (
    <div style={{ padding: "14px 16px" }}>
      <div className="label" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div
          className={mono ? "mono" : ""}
          style={{
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: accent ?? "var(--text-1)",
          }}
        >
          {value}
        </div>
        {delta != null && (
          <div className="mono" style={{ color, fontSize: 11.5 }}>
            {arrow} {Math.abs(delta)}
          </div>
        )}
      </div>
      {sub && (
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-3)" }}>{sub}</div>
      )}
    </div>
  );
}
