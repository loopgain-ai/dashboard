// Methodology modal for the /demo route.
//
// Discloses what the demo is, what it isn't, what's measured vs.
// projected, and where the defaults come from. Every credibility-risky
// number in the demo dashboard should have an answer in this modal.
//
// Sourced from the 2026-05-28 research pass (Claude Desktop synthesis,
// 24 sources) — see the bullet list below for the consequential ones.

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
          A production-scale projection: every distributional characteristic
          (Aβ shape, outcome ratios, iterations-to-best, iteration
          counts, framework mix) is bootstrap-sampled from the{" "}
          <a
            href="/benchmark"
            style={{ color: "var(--accent)" }}
          >
            public benchmark tenant
          </a>{" "}
          — 2,000 paired real-API runs of Claude Haiku 4.5 across{" "}
          <strong>5 workload classes</strong> (codegen / debate /
          multi-step planner / RAG retrieval refinement / adversarial),{" "}
          <strong>7 framework categories</strong> (the library's 6
          shipped integration adapters — LangGraph, CrewAI, AutoGen,
          LangChain, OpenAI Agents SDK, Claude Agent SDK — plus a
          bare-Anthropic-SDK control cell that runs LoopGain directly
          without any framework wrapper), and{" "}
          <strong>5 loop types</strong> (refinement, verify_revise,
          tool_use_retry, critique_revise, iterative_retrieval). Two
          parameters are yours to set:{" "}
          <strong>loop events / month</strong> (your scale) and{" "}
          <strong>$/iter</strong> (your model + token budget). The chart
          sample is a representative ~3,000-event slice of your selected
          scale; the headline aggregates are scaled by{" "}
          <span className="mono" style={{ color: "var(--text-1)" }}>
            N / 2000
          </span>{" "}
          from the bench measurements.
        </Section>

        <Section title="What this is not">
          Not a claim that production agent loops look exactly like the
          bench. The bench is a <em>deliberate mix</em> of easy regimes
          (codegen with deterministic verifiers — 400 events, 20% of
          bench) and harder regimes (multi-step planner 400 / debate
          critique-revise 400 / RAG retrieval refinement 200 /
          adversarial-by-design 600). The aggregate 65/18/17
          conv/osc/div split reflects that blend; a real production
          tenant on a single high-volume easy flow (support deflection,
          extraction) would converge much more cleanly, while a tenant
          dominated by intrinsic chain-of-thought reasoning (which our
          research shows <em>fails</em> at self-correction without
          external feedback) would diverge more. The projection is
          credible as a <em>multi-workload mid-difficulty case</em>, not
          as "the production distribution" — your actual loop dynamics
          will differ.
        </Section>

        <Section title="Default parameter defense">
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>
              <strong>Mid-market default = 1M events/month.</strong>{" "}
              Anchored on LangSmith's "1–1.4M traces/month = mid-size
              enterprise" guidance and Langfuse's "~500K LLM calls/month
              = mid-market" baseline. A few product flows at 50K–100K
              conversations/month × ~10–25 spans per agentic trace ≈ 1M
              events. SMB (50K) sits at the Langfuse free-tier ceiling;
              Enterprise (30M) is in the Klarna-scale range (2.3M
              conversations × 10–25 spans).
            </li>
            <li>
              <strong>Sonnet 4.6 default → ~$0.045/iter.</strong> Per-iter
              = one revise call + one verify call. At Sonnet's $3/MTok
              input + $15/MTok output, ~10K input + ~1K output tokens per
              iter (production agents typically run 5K–15K input tokens
              per turn with tool definitions, history, and retrieved
              context) → $0.030 + $0.015 = $0.045/iter, rounded to $0.04
              in the slider's display. Haiku lean (~6K + 1K) ≈ $0.011;
              Opus heavy (~13K + 1.2K) ≈ $0.095.
            </li>
            <li>
              <strong>
                Bench's own implied $0.000625/iter is{" "}
                <em>not</em> a price to fix.
              </strong>{" "}
              That's the real measured cost of Haiku 4.5 on lean
              bench prompts (a few hundred tokens/iter average across
              the 5 workload classes). Production agents run 10–100×
              more tokens/iter with rich tool definitions, retrieved
              context, and conversation history; we keep the bench's
              receipts as-is and project to realistic production cost
              here.
            </li>
            <li>
              <strong>
                <code style={{ fontFamily: "var(--mono)" }}>max_iter=20</code>{" "}
                is the fixed-cap baseline used in the savings math.
              </strong>{" "}
              The Iterations · 30d card shows{" "}
              <span className="mono" style={{ color: "var(--text-1)" }}>
                used / (events × 20)
              </span>{" "}
              as a counterfactual "what you'd have spent if every loop ran
              the full cap with no LoopGain rolling them back early." 20 is
              the bench protocol's max_iter setting, hardcoded here for the
              public demo. A real customer would set this from their tenant
              config; if your production cap is meaningfully lower (e.g.
              5–10), the headline reduction % will be smaller than what's
              shown here. This is the assumption most worth interrogating
              when comparing the demo to your reality.
            </li>
          </ul>
        </Section>

        <Section title="What's measured vs. projected">
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={cellStyle}>Metric</th>
                <th style={cellStyle}>Source</th>
              </tr>
            </thead>
            <tbody>
              <Row metric="Outcome distribution (CONV / OSC / DIV)" source="Measured — bench" />
              <Row metric="Aβ distribution (median, p99, per-event)" source="Measured — bench" />
              <Row metric="Gain margin distribution (median, p10)" source="Measured — bench" />
              <Row metric="Iterations per run, rollback rate" source="Measured — bench" />
              <Row metric="Framework / loop_type / team mix" source="Measured — bench" />
              <Row
                metric="Headline aggregates (total events, iterations, rollbacks)"
                source="Scaled by N/2000 from bench"
              />
              <Row
                metric="Savings $ + spend $"
                source="Scaled iterations × your $/iter"
              />
              <Row
                metric="Visible chart sample (~3K events)"
                source="Bootstrap-sampled from bench"
              />
            </tbody>
          </table>
        </Section>

        <Section title="Sources (research pass, 2026-05-28)">
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 11.5 }}>
            <li>Huang et al., "LLMs Cannot Self-Correct Reasoning Yet," ICLR 2024 (arxiv:2310.01798)</li>
            <li>Madaan et al., "Self-Refine," NeurIPS 2023 (arxiv:2303.17651)</li>
            <li>Yao et al., "τ-bench" (arxiv:2406.12045)</li>
            <li>Klarna × OpenAI press release (Feb 2024) — 2.3M conversations/month</li>
            <li>LangSmith pricing — langchain.com/pricing</li>
            <li>Langfuse pricing &amp; volumes — langfuse.com/pricing, langfuse.com/enterprise</li>
            <li>a16z "State of AI: 100 Trillion Token Study"</li>
            <li>
              Anthropic API pricing (Apr–May 2026) — platform.claude.com/docs/about-claude/pricing
            </li>
            <li>SWE-bench in 2026 cost figures — callsphere.ai, epoch.ai</li>
            <li>"TOOLATHLON" multi-step tool use benchmark (arxiv:2510.25726)</li>
          </ul>
        </Section>

        <Section title="If you want the underlying receipts">
          Go to{" "}
          <a href="/benchmark" style={{ color: "var(--accent)" }}>
            /benchmark
          </a>
          . That tenant shows the raw 2,000 paired Haiku-4.5 runs across
          the 5 workload classes and 7 frameworks — every number is
          measured, no projection or scaling. The /demo page you're
          looking at is bench dynamics × your scale assumptions.
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
