// Panel 6 — ETA Accuracy.
//
// Predicted vs actual iterations-to-converge, plotted as a calibration scatter.
// Data source: GET /v1/calibration — converged loops where the library
// captured a `first_eta_prediction` snapshot during the run.
//
// Predicted total = first_eta_at_iteration + first_eta_prediction.
// Calibration error = iterations_used - predicted_total.
//   error > 0  →  prediction was optimistic (we finished slower than predicted)
//   error < 0  →  prediction was pessimistic (we finished sooner)
//   error == 0 →  perfect.

import { useMemo, useState } from "react";
import { useCalibration } from "../../lib/data-hooks";
import { KPI, PanelHeader } from "../primitives";
import { Loaded } from "./PanelState";
import { mean, median } from "../../lib/stats";
import { fmtInt, fmtPct } from "../../lib/format";
import type { CalibrationEvent } from "../../types";

interface Props {
  pollMs?: number;
}

export function ETAAccuracy({ pollMs }: Props) {
  const calibration = useCalibration({ pollMs });
  return (
    <div style={{ padding: 24 }}>
      <Loaded
        state={calibration.state}
        isEmpty={(d) => d.events.length === 0}
        emptyFallback={<EmptyCalibration />}
      >
        {(data) => <ETAAccuracyBody events={data.events} />}
      </Loaded>
    </div>
  );
}

interface Sample {
  predicted: number;
  actual: number;
  error: number; // actual - predicted
  abs_pct: number; // |error| / actual
  workload_id: string | null;
  timestamp_hour: number;
}

function ETAAccuracyBody({ events }: { events: ReadonlyArray<CalibrationEvent> }) {
  const [hover, setHover] = useState<Sample | null>(null);

  const samples: Sample[] = useMemo(
    () =>
      events.map((e) => {
        const predicted = e.first_eta_at_iteration + e.first_eta_prediction;
        const actual = e.iterations_used;
        const error = actual - predicted;
        const abs_pct = actual > 0 ? Math.abs(error) / actual : 0;
        return {
          predicted,
          actual,
          error,
          abs_pct,
          workload_id: e.workload_id,
          timestamp_hour: e.timestamp_hour,
        };
      }),
    [events],
  );

  const mape = mean(samples.map((s) => s.abs_pct)) ?? 0;
  const medianErr = median(samples.map((s) => s.error)) ?? 0;
  const within1 = samples.filter((s) => Math.abs(s.error) <= 1).length;
  const within2 = samples.filter((s) => Math.abs(s.error) <= 2).length;
  const pctWithin1 = samples.length > 0 ? within1 / samples.length : 0;
  const pctWithin2 = samples.length > 0 ? within2 / samples.length : 0;

  // Per-workload mean signed error → bias.
  const workloadBias = useMemo(() => {
    const byWorkload = new Map<string, number[]>();
    for (const s of samples) {
      const key = s.workload_id ?? "(no workload)";
      const arr = byWorkload.get(key) ?? [];
      arr.push(s.error);
      byWorkload.set(key, arr);
    }
    return Array.from(byWorkload)
      .map(([workload, errors]) => ({
        workload,
        bias: mean(errors) ?? 0,
        n: errors.length,
      }))
      .filter((r) => r.n >= 2) // need >=2 samples for a meaningful bias
      .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))
      .slice(0, 12);
  }, [samples]);

  const maxAxis = Math.max(
    8,
    ...samples.map((s) => Math.max(s.predicted, s.actual)),
  );
  const maxBiasMag = Math.max(0.5, ...workloadBias.map((w) => Math.abs(w.bias)));

  return (
    <>
      <PanelHeader title="ETA Accuracy" />

      <div className="card eta-kpi-strip" style={{ padding: 0 }}>
        {[
          {
            label: "MAPE",
            value: fmtPct(mape),
            sub: `${fmtInt(samples.length)} converged loops`,
          },
          {
            label: "Median error",
            value: `${medianErr >= 0 ? "+" : ""}${medianErr.toFixed(1)} iter`,
            sub: medianErr > 0 ? "predicting fast" : medianErr < 0 ? "predicting slow" : "calibrated",
          },
          {
            label: "Within ±1",
            value: fmtPct(pctWithin1),
            sub: `${fmtInt(within1)} loops`,
          },
          {
            label: "Within ±2",
            value: fmtPct(pctWithin2),
            sub: `${fmtInt(within2)} loops`,
          },
        ].map((k, i) => (
          <div
            key={i}
            style={{
              padding: 18,
              borderLeft: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <KPI label={k.label} value={k.value} sub={k.sub} />
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{ marginTop: 16, padding: 16, position: "relative" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 6,
          }}
        >
          <div className="label">Predicted vs actual iterations · calibration scatter</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
            n={fmtInt(samples.length)} · max axis{" "}
            <span style={{ color: "var(--text-1)" }}>{maxAxis}</span>
          </div>
        </div>
        <CalibrationScatter
          samples={samples}
          maxAxis={maxAxis}
          onHover={setHover}
        />
        {hover && (
          <div
            style={{
              position: "absolute",
              right: 24,
              top: 28,
              background: "var(--surf-3)",
              border: "1px solid var(--border-2)",
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 11.5,
              fontFamily: "var(--mono)",
              pointerEvents: "none",
              zIndex: 50,
              maxWidth: 280,
              boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ color: "var(--text-3)" }}>
              workload{" "}
              <span style={{ color: "var(--text-1)" }}>
                {hover.workload_id ?? "—"}
              </span>
            </div>
            <div style={{ color: "var(--text-3)", marginTop: 4 }}>
              predicted{" "}
              <span style={{ color: "var(--text-1)" }}>{hover.predicted}</span>{" "}
              · actual{" "}
              <span style={{ color: "var(--text-1)" }}>{hover.actual}</span>
            </div>
            <div style={{ color: "var(--text-3)", marginTop: 4 }}>
              error{" "}
              <span
                style={{
                  color:
                    hover.error === 0
                      ? "var(--band-conv)"
                      : Math.abs(hover.error) <= 1
                      ? "var(--text-1)"
                      : "var(--band-stall)",
                }}
              >
                {hover.error >= 0 ? "+" : ""}
                {hover.error} iter
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="eta-bottom-grid">
        <div className="card" style={{ padding: 16 }}>
          <div className="label" style={{ marginBottom: 10 }}>
            Per-workload bias (mean signed error · ≥2 samples)
          </div>
          {workloadBias.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: 12 }}>
              Not enough samples per workload yet. Aim for ≥2 converged loops
              per workload to surface bias.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workloadBias.map((w, i) => (
                <BiasRow key={i} row={w} max={maxBiasMag} />
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="label" style={{ marginBottom: 10 }}>
            Interpretation
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-2)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div>
              <div className="mono" style={{ color: "var(--band-conv)", marginBottom: 4 }}>
                MAPE &lt; 15%
              </div>
              Calibration is solid. "Stop early, you'll converge in N more iterations"
              decisions can be trusted.
            </div>
            <div>
              <div className="mono" style={{ color: "var(--band-stall)", marginBottom: 4 }}>
                Median error &gt; 0
              </div>
              Predictions are optimistic — loops finish slower than the formula
              expects. Consider widening the smoothing window or recalibrating
              the gain coefficient.
            </div>
            <div>
              <div className="mono" style={{ color: "var(--text-3)", marginBottom: 4 }}>
                Predicted total = first_eta_at_iteration + first_eta_prediction
              </div>
              The library captures the first computable eta snapshot during
              <code style={{ color: "var(--text-1)", margin: "0 4px" }}>observe()</code>
              and reports it once at terminal. Re-prediction over time isn't
              recorded in v1 telemetry.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Calibration scatter ───────────────────────────────────────────────

function CalibrationScatter({
  samples,
  maxAxis,
  onHover,
}: {
  samples: ReadonlyArray<Sample>;
  maxAxis: number;
  onHover: (s: Sample | null) => void;
}) {
  const width = 1080;
  const height = 360;
  const pad = { left: 44, right: 24, top: 16, bottom: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const x = (v: number) => pad.left + (v / maxAxis) * plotW;
  const y = (v: number) => pad.top + plotH - (v / maxAxis) * plotH;

  // Ticks every ~25% of the axis.
  const ticks = [0, 0.25, 0.5, 0.75, 1.0].map((t) => Math.round(t * maxAxis));

  // Stack overlapping dots radially to make density readable.
  const keyCounts = new Map<string, number>();
  const placed = samples.map((s) => {
    const k = `${s.predicted}|${s.actual}`;
    const idx = keyCounts.get(k) ?? 0;
    keyCounts.set(k, idx + 1);
    return { s, idx };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "auto", display: "block" }}
      onMouseLeave={() => onHover(null)}
    >
      {/* Grid */}
      {ticks.map((t) => (
        <g key={`gx-${t}`}>
          <line
            x1={x(t)}
            x2={x(t)}
            y1={pad.top}
            y2={pad.top + plotH}
            stroke="var(--border)"
            strokeDasharray="2 4"
          />
          <text
            x={x(t)}
            y={pad.top + plotH + 18}
            fill="var(--text-3)"
            fontSize="10.5"
            fontFamily="var(--mono)"
            textAnchor="middle"
          >
            {t}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <g key={`gy-${t}`}>
          <line
            x1={pad.left}
            x2={pad.left + plotW}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--border)"
            strokeDasharray="2 4"
          />
          <text
            x={pad.left - 8}
            y={y(t) + 3}
            fill="var(--text-3)"
            fontSize="10.5"
            fontFamily="var(--mono)"
            textAnchor="end"
          >
            {t}
          </text>
        </g>
      ))}

      {/* Identity line — predicted = actual */}
      <line
        x1={x(0)}
        y1={y(0)}
        x2={x(maxAxis)}
        y2={y(maxAxis)}
        stroke="var(--accent)"
        strokeWidth={1.25}
        strokeDasharray="6 4"
      />

      {/* Axis labels */}
      <text
        x={pad.left + plotW / 2}
        y={height - 4}
        fill="var(--text-3)"
        fontSize="11"
        fontFamily="var(--mono)"
        textAnchor="middle"
      >
        predicted iterations
      </text>
      <text
        x={12}
        y={pad.top + plotH / 2}
        fill="var(--text-3)"
        fontSize="11"
        fontFamily="var(--mono)"
        textAnchor="middle"
        transform={`rotate(-90, 12, ${pad.top + plotH / 2})`}
      >
        actual iterations
      </text>

      {/* Dots */}
      {placed.map(({ s, idx }, i) => {
        const offset = idx * 1.6;
        const angle = (idx * 2.4) % (Math.PI * 2);
        const dx = Math.cos(angle) * offset;
        const dy = Math.sin(angle) * offset;
        const cx = x(s.predicted) + dx;
        const cy = y(s.actual) + dy;
        const absErr = Math.abs(s.error);
        const color =
          absErr === 0
            ? "var(--band-conv)"
            : absErr <= 1
            ? "var(--text-1)"
            : absErr <= 2
            ? "var(--band-stall)"
            : "var(--band-osc)";
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={3.5}
            fill={color}
            fillOpacity={0.75}
            stroke="var(--surf-1)"
            strokeWidth={0.5}
            onMouseEnter={() => onHover(s)}
            style={{ cursor: "crosshair" }}
          />
        );
      })}
    </svg>
  );
}

// ── Per-workload bias row ─────────────────────────────────────────────

function BiasRow({
  row,
  max,
}: {
  row: { workload: string; bias: number; n: number };
  max: number;
}) {
  const pct = Math.min(1, Math.abs(row.bias) / max);
  const isPositive = row.bias > 0;
  const sign = isPositive ? "+" : row.bias < 0 ? "" : "";
  const color =
    Math.abs(row.bias) <= 0.5
      ? "var(--text-2)"
      : Math.abs(row.bias) <= 1.5
      ? "var(--band-stall)"
      : "var(--band-osc)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.2fr) 1fr 80px",
        gap: 10,
        alignItems: "center",
      }}
    >
      <div
        className="mono"
        title={row.workload}
        style={{
          fontSize: 11.5,
          color: "var(--text-2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {row.workload}
      </div>
      <div
        style={{
          position: "relative",
          height: 16,
          background: "var(--surf-2)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {/* Center reference line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            width: 1,
            background: "var(--border-2)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            background: color,
            opacity: 0.7,
            width: `${(pct * 50).toFixed(1)}%`,
            left: isPositive ? "50%" : `${(50 - pct * 50).toFixed(1)}%`,
          }}
        />
      </div>
      <div
        className="mono"
        style={{
          fontSize: 11,
          color,
          textAlign: "right",
        }}
      >
        {sign}
        {row.bias.toFixed(2)} · n={row.n}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────

function EmptyCalibration() {
  return (
    <div className="card" style={{ padding: 32, textAlign: "center" }}>
      <div className="label" style={{ color: "var(--accent)", marginBottom: 8 }}>
        Awaiting eta-prediction samples
      </div>
      <div
        style={{
          color: "var(--text-2)",
          fontSize: 13,
          lineHeight: 1.6,
          maxWidth: 620,
          margin: "0 auto",
        }}
      >
        No converged loops with a captured eta snapshot in the last 30 days.
        Three conditions all have to hold for a row to land here:
        <ul
          style={{
            margin: "12px auto 4px",
            padding: "0 0 0 18px",
            textAlign: "left",
            display: "inline-block",
            color: "var(--text-2)",
          }}
        >
          <li>
            Library{" "}
            <span className="mono" style={{ color: "var(--text-1)" }}>
              loopgain ≥ 0.1.4
            </span>{" "}
            (earlier versions don't emit the snapshot).
          </li>
          <li>
            Loop runs with a non-zero{" "}
            <span className="mono" style={{ color: "var(--text-1)" }}>
              target_error
            </span>{" "}
            so the predictor has a goal to estimate against.
          </li>
          <li>
            Loop terminates as{" "}
            <span className="mono" style={{ color: "var(--text-1)" }}>
              converged
            </span>{" "}
            — calibration measures predicted-vs-actual on success only.
          </li>
        </ul>
      </div>
    </div>
  );
}
