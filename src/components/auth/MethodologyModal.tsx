// Methodology modal for the /demo route.
//
// Discloses what the demo is (a checkpoint replay of the real recorded
// benchmark run), what it isn't, and how the replay works. Every
// credibility-risky number in the demo dashboard should have an answer
// in this modal.

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MethodologyModal({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      style={{
        background: "var(--surf-1)",
        border: "1px solid var(--border-2)",
        borderRadius: 12,
        padding: 0,
        maxWidth: 720,
        width: "calc(100vw - 48px)",
        color: "var(--text-1)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
      }}
    >
      <div
        style={{
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          /demo · methodology &amp; sources
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            color: "var(--text-3)",
            fontSize: 18,
            cursor: "pointer",
            padding: "0 4px",
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div
        style={{
          padding: "16px 24px 20px",
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--text-2)",
          maxHeight: "70vh",
          overflowY: "auto",
        }}
      >
        <Section title="What this is">
          A <strong>live replay of the recorded benchmark run</strong>:
          you're watching the{" "}
          <a
            href="/benchmark"
            style={{ color: "var(--accent)" }}
          >
            public benchmark tenant's
          </a>{" "}
          own dashboard, picked up 1,000 runs before the end of its
          2,000-run recorded benchmark — 2,000 paired real-API runs of
          Claude Haiku 4.5 across <strong>5 workload classes</strong>{" "}
          (codegen / debate / multi-step planner / RAG retrieval
          refinement / adversarial), <strong>7 framework categories</strong>{" "}
          (the library's 6 shipped integration adapters — LangGraph,
          CrewAI, AutoGen, LangChain, OpenAI Agents SDK, Claude Agent SDK
          — plus a bare-Anthropic-SDK control cell), and{" "}
          <strong>5 loop types</strong>. On load, every panel shows the
          exact state the dashboard was in after the first 1,000 recorded
          runs had landed; the remaining runs then arrive about once a
          second in their true recorded order, and every figure accrues
          each run's own measured numbers. When the run finishes, the
          replay loops back to the checkpoint.
        </Section>

        <Section title="How the replay works">
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>
              <strong>No inference happens.</strong> Every trajectory,
              band, iteration count and dollar was measured when the
              benchmark actually ran (June 2026); the replay only reveals
              the recorded events in order. "Live" always means "live
              replay of recorded runs," never live model calls.
            </li>
            <li>
              <strong>Nothing is scaled or re-costed.</strong> Dollar
              figures are the runs' own paired-baseline measurements
              (each workload ran both under LoopGain and under a fixed
              max_iter=20 cap; the delta is real API cost). The totals
              you watch grow converge to the same numbers published on
              the landing page and at /benchmark — 92.8% of loop spend
              eliminated, $25.11 measured savings on the full run.
            </li>
            <li>
              <strong>The clock is compressed.</strong> The recorded run
              ingested over ~9 hours; the replay plays its final 1,000
              runs in ~17 minutes. Arrival <em>hours</em> in the pulse
              chart are the true recorded ones; only the playback speed
              is compressed.
            </li>
            <li>
              <strong>Alert rules are example configuration.</strong> The
              bench tenant never configured paging, so the Alerts panel
              shows three example rules + an illustrative audit trail
              (labeled in-panel). Configuration, not measurement.
            </li>
            <li>
              <strong>
                <code style={{ fontFamily: "var(--mono)" }}>max_iter=20</code>{" "}
                is the fixed-cap baseline in the savings math
              </strong>{" "}
              — the bench protocol's own setting. If your production cap
              is meaningfully lower (e.g. 5–10), the headline reduction %
              on your fleet will be smaller than the bench's. This is the
              assumption most worth interrogating when comparing the
              bench to your reality.
            </li>
          </ul>
        </Section>

        <Section title="What this is not">
          Not a claim that production agent loops look exactly like the
          bench. The bench is a <em>deliberate mix</em> of easy regimes
          (codegen with deterministic verifiers — 400 events, 20% of
          bench) and harder regimes (multi-step planner 400 / debate
          critique-revise 400 / RAG retrieval refinement 200 /
          adversarial-by-design 600). The aggregate conv/osc/div split
          reflects that blend; a real production tenant on a single
          high-volume easy flow (support deflection, extraction) would
          converge much more cleanly, while a tenant dominated by
          intrinsic chain-of-thought reasoning (which the research shows{" "}
          <em>fails</em> at self-correction without external feedback)
          would diverge more. Read it as a{" "}
          <em>multi-workload mid-difficulty case</em>, not "the
          production distribution" — your loop dynamics will differ.
          And the bench ran lean Haiku prompts (~$0.0006/iter measured);
          production agents with rich tool definitions and context run
          10–100× more tokens per iteration, so your absolute dollars
          scale accordingly even where the percentages carry over.
        </Section>

        <Section title="What's measured vs. what isn't">
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={cellStyle}>Surface</th>
                <th style={cellStyle}>Source</th>
              </tr>
            </thead>
            <tbody>
              <Row metric="Every stat, chart, trajectory and dollar" source="Measured — recorded bench run" />
              <Row metric="Arrival hours in the pulse chart" source="Measured — recorded (playback compressed)" />
              <Row metric="Alert rules + delivery audit trail" source="Example configuration (labeled)" />
              <Row metric="max_iter=20 counterfactual baseline" source="Bench protocol setting" />
            </tbody>
          </table>
        </Section>

        <Section title="If you want the underlying receipts">
          Go to{" "}
          <a href="/benchmark" style={{ color: "var(--accent)" }}>
            /benchmark
          </a>{" "}
          for the finished run's static view, or the{" "}
          <a
            href="https://github.com/loopgain-ai/loopgain-bench"
            target="_blank"
            rel="noopener"
            style={{ color: "var(--accent)" }}
          >
            public bench repo
          </a>{" "}
          for the raw trial data and protocol. Same tenant, same 2,000
          runs — the /demo page you're looking at is that run, replayed.
        </Section>
      </div>

      <div
        style={{
          padding: "12px 24px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "var(--accent)",
            color: "#06080d",
            border: "1px solid var(--accent)",
            borderRadius: 5,
            padding: "6px 14px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Got it
        </button>
      </div>
    </dialog>
  );
}

const cellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  color: "var(--text-3)",
  fontWeight: 500,
  fontSize: 11,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3
        style={{
          margin: "0 0 6px",
          fontSize: 12.5,
          color: "var(--text-1)",
          fontWeight: 600,
        }}
      >
        {title}
      </h3>
      <div>{children}</div>
    </div>
  );
}

function Row({ metric, source }: { metric: string; source: string }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={{ padding: "5px 8px", color: "var(--text-2)" }}>{metric}</td>
      <td
        style={{
          padding: "5px 8px",
          color: "var(--text-2)",
          fontFamily: "var(--mono)",
          fontSize: 11,
        }}
      >
        {source}
      </td>
    </tr>
  );
}
