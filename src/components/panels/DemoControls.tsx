// Demo controls — the two-knob projection panel rendered above the
// dashboard on the /demo route. Lets the visitor pick:
//
//   1. Loop events / month (presets + log slider)   — fleet-scale dimension
//   2. Model preset (Haiku / Sonnet / Opus / Mixed) — drives default $/iter
//   3. $/iter (overridable numeric input)            — fine-tune the cost
//
// Changes trigger re-fetch + re-scale via the deps array on the demo
// data-hooks (see src/lib/data-hooks.ts).

import { useState } from "react";
import { useDemoParams } from "../../lib/demo-params";
import {
  FLEET_PRESETS,
  MODEL_PRESETS,
  type ModelId,
} from "../../lib/demo";
import { fmtInt } from "../../lib/format";
import { Chip } from "../primitives";

interface Props {
  onOpenMethodology: () => void;
}

const LOG_MIN = Math.log10(10_000); // 10K events/month
const LOG_MAX = Math.log10(100_000_000); // 100M events/month

function eventsToSlider(events: number): number {
  const v = Math.max(events, 10_000);
  return (Math.log10(v) - LOG_MIN) / (LOG_MAX - LOG_MIN);
}

function sliderToEvents(t: number): number {
  const log = LOG_MIN + t * (LOG_MAX - LOG_MIN);
  return Math.round(Math.pow(10, log));
}

function fmtEvents(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return fmtInt(n);
}

function fmtUSD(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

function fmtMonthlySpend(eventsPerMonth: number, dollarsPerIter: number, itersPerEventAvg: number): string {
  const monthlyIters = eventsPerMonth * itersPerEventAvg;
  const spend = monthlyIters * dollarsPerIter;
  if (spend >= 1_000_000) return `~$${(spend / 1_000_000).toFixed(1)}M / month`;
  if (spend >= 1_000) return `~$${Math.round(spend / 1_000)}K / month`;
  return `~$${spend.toFixed(0)} / month`;
}

export function DemoControls({ onOpenMethodology }: Props) {
  const { params, model, setEventsPerMonth, setDollarsPerIter, setModel } =
    useDemoParams();
  const [costDraft, setCostDraft] = useState<string>(params.dollarsPerIter.toFixed(4));

  // Sync cost draft when the user picks a different model preset
  // (which auto-updates params.dollarsPerIter).
  if (parseFloat(costDraft) !== params.dollarsPerIter && document.activeElement?.tagName !== "INPUT") {
    setCostDraft(params.dollarsPerIter.toFixed(4));
  }

  // Approximate "iters/event" from the bench: 2,882 iters / 2,000 events ≈ 1.44.
  // This drives the inline monthly-spend sanity-check ("at your knobs that's
  // ~$N/month"), helping the visitor catch their own configuration mistakes.
  const itersPerEventAvg = 1.44;

  const modelPreset = MODEL_PRESETS.find((m) => m.id === model);

  function selectModel(id: ModelId) {
    setModel(id);
  }

  function commitCost(): void {
    const n = parseFloat(costDraft);
    if (Number.isFinite(n) && n > 0) {
      setDollarsPerIter(n);
    } else {
      setCostDraft(params.dollarsPerIter.toFixed(4));
    }
  }

  return (
    <div
      className="card"
      style={{
        margin: "0 16px 16px",
        padding: "14px 16px",
        background: "var(--surf-1)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            className="label"
            style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 11.5 }}
          >
            DEMO CONTROLS
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Adjust to project the benchmark dynamics to your scale +
            pricing assumptions.
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenMethodology}
          style={{
            fontSize: 11,
            color: "var(--accent)",
            textDecoration: "underline",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
          }}
        >
          ⓘ methodology &amp; sources
        </button>
      </div>

      <div className="demo-controls-grid">
        {/* ── Loop events / month ─────────────────────────────────── */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span className="label" style={{ fontSize: 10.5 }}>
              LOOP EVENTS / MONTH
            </span>
            <span
              className="mono"
              style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}
            >
              {fmtEvents(params.eventsPerMonth)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            {FLEET_PRESETS.map((p) => (
              <Chip
                key={p.id}
                on={params.eventsPerMonth === p.eventsPerMonth}
                onClick={() => setEventsPerMonth(p.eventsPerMonth)}
              >
                {p.label} · {fmtEvents(p.eventsPerMonth)}
              </Chip>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={eventsToSlider(params.eventsPerMonth)}
            onChange={(e) => setEventsPerMonth(sliderToEvents(parseFloat(e.target.value)))}
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
          <div
            className="mono"
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--text-3)",
              marginTop: 2,
            }}
          >
            <span>10K</span>
            <span>100K</span>
            <span>1M</span>
            <span>10M</span>
            <span>100M</span>
          </div>
        </div>

        {/* ── Model & cost ────────────────────────────────────────── */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span className="label" style={{ fontSize: 10.5 }}>
              MODEL · $/ITER
            </span>
            <span
              className="mono"
              style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}
            >
              {fmtUSD(params.dollarsPerIter)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            {MODEL_PRESETS.map((p) => (
              <Chip key={p.id} on={model === p.id} onClick={() => selectModel(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: "var(--text-3)",
              flexWrap: "wrap",
            }}
          >
            <span>override</span>
            <input
              type="text"
              inputMode="decimal"
              value={costDraft}
              onChange={(e) => setCostDraft(e.target.value)}
              onBlur={commitCost}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitCost();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              style={{
                width: 84,
                background: "var(--surf-2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "3px 8px",
                fontFamily: "var(--mono)",
                fontSize: 12,
                color: "var(--text-1)",
              }}
            />
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                color: "var(--text-3)",
                flex: "1 1 200px",
                minWidth: 0,
              }}
            >
              {modelPreset
                ? `(${modelPreset.label} ~${fmtInt(modelPreset.tokensInput)} in + ${fmtInt(modelPreset.tokensOutput)} out · ${modelPreset.notes})`
                : ""}
            </span>
          </div>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 6 }}
          >
            implies{" "}
            <span style={{ color: "var(--text-1)" }}>
              {fmtMonthlySpend(params.eventsPerMonth, params.dollarsPerIter, itersPerEventAvg)}
            </span>{" "}
            in inference at this fleet scale (rough sanity check)
          </div>
        </div>
      </div>
    </div>
  );
}
