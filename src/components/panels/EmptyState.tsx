// Empty state — install instructions for someone who explicitly wants
// them. Public visitors with no config are redirected to /demo at boot
// and on disconnect (see main.tsx and useAuthProvider.disconnect); they
// don't pass through here in the normal flow. Reachable via the explicit
// `route === "empty"` case in App.tsx.

import { useState } from "react";
import { Chip, Icon, PanelHeader } from "../primitives";

interface Props {
  openConnect: () => void;
}

// Adapter framework IDs map to the snippet shown in the integration
// card. Per loopgain-core/pyproject.toml (Apr 2026), the library ships
// six framework adapters under `loopgain.integrations`, each lazily
// loaded so installing `loopgain` doesn't pull in any framework.
type Lang =
  | "python"
  | "langgraph"
  | "crewai"
  | "autogen"
  | "langchain"
  | "openai-agents"
  | "claude-agent-sdk";

const SNIPPETS: Record<Lang, { label: string; install: string; code: string }> = {
  python: {
    label: "Python (bare)",
    install: "pip install loopgain",
    code: `# The OSS integration surface — drive the loop yourself and call
# LoopGain on each iteration. Works with any agent framework.
from loopgain import LoopGain

lg = LoopGain(target_error=0.1, max_iterations=20)
while lg.should_continue():
    errors = verifier.verify(output)
    lg.observe(errors)
    output = reviser.revise(output, errors)

# Optional — send anonymized aggregates to the hosted dashboard.
lg.send_telemetry(
    endpoint="https://telemetry.loopgain.ai/v1/aggregate",
    token="lgk_...",
    workload_id="rag-rewrite-prod",
)`,
  },
  langgraph: {
    label: "LangGraph",
    install: "pip install 'loopgain[langgraph]'",
    code: `from loopgain import LoopGain
from loopgain.integrations import LangGraphAdapter

lg = LoopGain(target_error=0.1, max_iterations=20)
adapter = LangGraphAdapter(
    lg=lg,
    error_fn=lambda update: len(update.get("verifier_errors") or []),
)
final_state = adapter.run(graph, input_state)

# Optional telemetry; framework auto-stamped as "langgraph".
lg.send_telemetry(
    endpoint="https://telemetry.loopgain.ai/v1/aggregate",
    token="lgk_...",
    workload_id="rag-rewrite-prod",
    framework=adapter.framework_name,
)`,
  },
  crewai: {
    label: "CrewAI",
    install: "pip install 'loopgain[crewai]'",
    code: `from loopgain import LoopGain
from loopgain.integrations import CrewAIAdapter

lg = LoopGain(target_error=0.1, max_iterations=20)
adapter = CrewAIAdapter(
    lg=lg,
    error_fn=lambda step: step.errors_remaining,
)
result = adapter.run(crew, inputs)`,
  },
  autogen: {
    label: "AutoGen v0.4+",
    install: "pip install 'loopgain[autogen]'",
    code: `from loopgain import LoopGain
from loopgain.integrations import AutoGenAdapter

lg = LoopGain(target_error=0.1, max_iterations=20)
adapter = AutoGenAdapter(
    lg=lg,
    error_fn=lambda msg: count_open_issues(msg),
)
result = await adapter.run(team, task)`,
  },
  langchain: {
    label: "LangChain",
    install: "pip install 'loopgain[langchain]'",
    code: `from loopgain import LoopGain
from loopgain.integrations import LangChainAdapter

lg = LoopGain(target_error=0.1, max_iterations=20)
adapter = LangChainAdapter(
    lg=lg,
    error_fn=lambda step: len(step.intermediate_steps),
)
result = adapter.run(agent_executor, {"input": query})`,
  },
  "openai-agents": {
    label: "OpenAI Agents SDK",
    install: "pip install 'loopgain[openai-agents]'",
    code: `from loopgain import LoopGain
from loopgain.integrations import OpenAIAgentsAdapter

lg = LoopGain(target_error=0.1, max_iterations=20)
adapter = OpenAIAgentsAdapter(
    lg=lg,
    error_fn=lambda turn: count_tool_failures(turn),
)
result = await adapter.run(agent, input_items)`,
  },
  "claude-agent-sdk": {
    label: "Claude Agent SDK",
    install: "pip install 'loopgain[claude-agent-sdk]'",
    code: `from loopgain import LoopGain
from loopgain.integrations import ClaudeAgentSDKAdapter

lg = LoopGain(target_error=0.1, max_iterations=20)
adapter = ClaudeAgentSDKAdapter(
    lg=lg,
    error_fn=lambda msg: count_verifier_findings(msg),
)
result = await adapter.run(client, prompt)`,
  },
};

const LANG_ORDER: Lang[] = [
  "python",
  "langgraph",
  "crewai",
  "autogen",
  "langchain",
  "openai-agents",
  "claude-agent-sdk",
];

export function EmptyState({ openConnect }: Props) {
  const [lang, setLang] = useState<Lang>("python");
  const [copied, setCopied] = useState(false);

  const snippet = SNIPPETS[lang];

  function copy(): void {
    navigator.clipboard?.writeText(snippet.code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <PanelHeader
        eyebrow="Welcome to LoopGain"
        title="Instrument your first loop"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Chip onClick={() => window.location.assign("/demo")}>
              View demo
            </Chip>
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
              Pick your framework. LoopGain ships adapters for the six most
              common.
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4 }}>
              Once a loop calls{" "}
              <span className="mono" style={{ color: "var(--text-1)" }}>
                lg.observe()
              </span>{" "}
              and emits telemetry, it appears on the Health Map within a
              refresh interval.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {LANG_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setLang(id)}
                style={{
                  height: 30,
                  padding: "0 12px",
                  fontSize: 11.5,
                  fontFamily: "var(--mono)",
                  color: lang === id ? "var(--text-1)" : "var(--text-3)",
                  background: lang === id ? "var(--surf-3)" : "transparent",
                  borderRight: "1px solid var(--border)",
                }}
              >
                {SNIPPETS[id].label}
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
          {snippet.code}
        </pre>

        <div
          className="install-steps"
          style={{
            marginTop: 20,
            padding: "16px 0 0",
            borderTop: "1px solid var(--border)",
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
              {snippet.install}
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              2 — Get a telemetry token
            </div>
            <div style={{ color: "var(--text-2)" }}>
              Hosted: email{" "}
              <a
                href="mailto:hello@loopgain.ai"
                style={{ color: "var(--accent)" }}
              >
                hello@loopgain.ai
              </a>{" "}
              while the public signup flow ships. Self-hosted: provision via
              the{" "}
              <a
                href="https://github.com/loopgain-ai/telemetry-receiver"
                target="_blank"
                rel="noopener"
                style={{ color: "var(--accent)" }}
              >
                telemetry-receiver
              </a>
              's{" "}
              <span className="mono" style={{ color: "var(--text-1)" }}>
                wrangler dispatch
              </span>{" "}
              token-issue script.
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              3 — Send telemetry
            </div>
            <div style={{ color: "var(--text-2)" }}>
              Call{" "}
              <span className="mono" style={{ color: "var(--text-1)" }}>
                lg.send_telemetry()
              </span>{" "}
              after each loop terminates (or use the adapter's auto-stamped
              path).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
