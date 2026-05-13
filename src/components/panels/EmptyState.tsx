// Empty state — shown when no endpoint is configured and demo mode is off.
// The Python integration snippet is the empty state.

import { useState } from "react";
import { useAuth } from "../../lib/api";
import { Chip, Icon, PanelHeader } from "../primitives";

interface Props {
  openConnect: () => void;
}

const PY_SNIPPET = `# Three lines — that's the whole integration surface for the OSS path.
from loopgain import LoopGain

guard = LoopGain(target_error=0.1)
while guard.should_continue():
    errors = verifier.verify(output)
    guard.observe(errors)
    output = reviser.revise(output, errors)

# Then (optional) opt into anonymized aggregates for the dashboard:
guard.send_telemetry(
    endpoint="https://telemetry.loopgain.ai/v1/aggregate",
    token="lgk_...",
    workload_id="rag-rewrite-prod",
)`;

const LG_SNIPPET = `from langgraph.graph import StateGraph
from loopgain.adapters.langgraph import LangGraphGuard

graph = StateGraph(State).add_node("rewrite", rewrite_node)
guarded = LangGraphGuard.wrap(graph, target_error=0.1)
app = guarded.compile()`;

export function EmptyState({ openConnect }: Props) {
  const { setDemo } = useAuth();
  const [lang, setLang] = useState<"python" | "langgraph">("python");
  const [copied, setCopied] = useState(false);

  const snippet = lang === "python" ? PY_SNIPPET : LG_SNIPPET;

  function copy(): void {
    navigator.clipboard?.writeText(snippet).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <PanelHeader
        eyebrow="Welcome to LoopGain"
        title="No loops streaming yet"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Chip onClick={() => setDemo(true)}>Use demo data</Chip>
            <Chip
              onClick={openConnect}
              style={{
                background: "var(--accent)",
                color: "#06080d",
                border: "1px solid var(--accent)",
              }}
            >
              Connect endpoint
            </Chip>
          </div>
        }
      />

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "color-mix(in oklab, var(--accent) 16%, transparent)",
              border: "1px solid color-mix(in oklab, var(--accent) 35%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
              flex: "0 0 auto",
            }}
          >
            <Icon.Code />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-1)" }}>
              Send your first loop in three lines.
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4 }}>
              Once a loop calls <span className="mono" style={{ color: "var(--text-1)" }}>guard.observe()</span>{" "}
              and emits telemetry, it appears on the Health Map within a refresh interval.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {(
              [
                { id: "python" as const, label: "Python" },
                { id: "langgraph" as const, label: "LangGraph" },
              ]
            ).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                style={{
                  height: 30,
                  padding: "0 14px",
                  fontSize: 12,
                  fontFamily: "var(--mono)",
                  color: lang === l.id ? "var(--text-1)" : "var(--text-3)",
                  background: lang === l.id ? "var(--surf-3)" : "transparent",
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
          <Chip onClick={copy} icon={<Icon.Copy />}>
            {copied ? "copied" : "copy"}
          </Chip>
        </div>

        <pre
          style={{
            marginTop: 12,
            padding: 18,
            background: "var(--bg-0)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontFamily: "var(--mono)",
            fontSize: 12.5,
            lineHeight: 1.65,
            color: "var(--text-2)",
            overflow: "auto",
            margin: 0,
            marginBottom: 0,
          }}
        >
          {snippet}
        </pre>

        <div
          style={{
            marginTop: 20,
            padding: "16px 0 0",
            borderTop: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.55,
          }}
        >
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              1 — Install
            </div>
            <div className="mono" style={{ color: "var(--text-1)" }}>
              pip install loopgain
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              2 — Provision a token
            </div>
            <div style={{ color: "var(--text-2)" }}>
              Issued by your receiver admin via{" "}
              <span className="mono" style={{ color: "var(--text-1)" }}>
                npm run issue-token
              </span>
              .
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              3 — Send telemetry
            </div>
            <div style={{ color: "var(--text-2)" }}>
              Call{" "}
              <span className="mono" style={{ color: "var(--text-1)" }}>
                guard.send_telemetry()
              </span>{" "}
              after each loop terminates.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
