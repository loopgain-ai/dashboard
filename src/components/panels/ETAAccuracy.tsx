// Panel 6 — ETA Accuracy.
//
// Honest placeholder: the v1 receiver schema does not carry the loop's
// predicted iterations-to-converge, so a real calibration curve isn't
// computable from current telemetry. Surface that explicitly rather than
// rendering synthetic numbers that would look like product analytics.

import { Chip, Icon, PanelHeader } from "../primitives";

export function ETAAccuracy() {
  return (
    <div style={{ padding: 24 }}>
      <PanelHeader
        eyebrow="Panel 06"
        title="ETA Accuracy"
        right={
          <Chip>
            <Icon.Clock />
            schema v2 required
          </Chip>
        }
      />

      <div
        className="card"
        style={{
          padding: 40,
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 32,
          alignItems: "start",
        }}
      >
        <div>
          <div className="label" style={{ marginBottom: 10 }}>
            What this panel will show
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 500,
              color: "var(--text-1)",
              lineHeight: 1.4,
            }}
          >
            Predicted iterations-to-converge plotted against actual, as a calibration curve.
            Drift detection on the rolling MAPE. Per-workload bias.
          </h2>
          <p style={{ marginTop: 14, color: "var(--text-2)", fontSize: 13, lineHeight: 1.6 }}>
            The Barkhausen-derived ETA formula is{" "}
            <span className="mono" style={{ color: "var(--text-1)" }}>
              iterations_remaining = log(E_target / E(n)) / log(Aβ_smooth)
            </span>
            . This panel will show whether that prediction is well-calibrated against actual
            convergence times — making "stop early, you'll converge in 2 more iterations"
            decisions trustworthy.
          </p>
        </div>

        <div
          style={{
            padding: 20,
            background: "var(--surf-2)",
            borderRadius: 8,
            border: "1px dashed var(--border-2)",
          }}
        >
          <div className="label" style={{ color: "var(--accent)", marginBottom: 8 }}>
            Awaiting schema v2
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
            The current telemetry schema (v1) stores only{" "}
            <span className="mono" style={{ color: "var(--text-1)" }}>
              iterations_used
            </span>{" "}
            per run. Calibration requires schema v2, which adds{" "}
            <span className="mono" style={{ color: "var(--text-1)" }}>
              predicted_iterations_at_observe()
            </span>{" "}
            so we can compare predicted vs. actual.
          </div>
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
              fontSize: 11.5,
              color: "var(--text-3)",
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <span className="label">Tracking issue:</span>{" "}
              <span className="mono" style={{ color: "var(--text-2)" }}>
                loopgain-ai/loopgain#schema-v2
              </span>
            </div>
            <div>
              <span className="label">Estimated:</span>{" "}
              <span className="mono" style={{ color: "var(--text-2)" }}>
                v0.2
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
