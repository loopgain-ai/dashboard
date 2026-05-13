// Settings panel — connection info, alert-rule editor (persisted locally),
// cost-per-iteration default.
//
// Honest scope: alert delivery isn't wired up server-side yet, so rules
// persist to localStorage only and the panel labels that fact clearly.

import { useEffect, useState } from "react";
import { useAuth } from "../../lib/api";
import { Chip, Icon, PanelHeader } from "../primitives";

const RULES_KEY = "loopgain-dashboard-alert-rules";

interface Rule {
  id: number;
  on: boolean;
  when: string;
  within: string;
  action: string;
}

const DEFAULT_RULES: Rule[] = [
  {
    id: 1,
    on: true,
    when: "cluster of DIVERGING > 3",
    within: "5min",
    action: 'pagerduty.page("oncall-mlops")',
  },
  {
    id: 2,
    on: true,
    when: "any loop GM < 1.0",
    within: "—",
    action: 'slack.post("#alerts-mlops")',
  },
  {
    id: 3,
    on: false,
    when: "rollback-rate > 12%",
    within: "24h",
    action: 'linear.create_issue("loopgain")',
  },
];

function loadRules(): Rule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return DEFAULT_RULES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Rule[]) : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

function saveRules(rules: Rule[]): void {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

interface Props {
  costPerIter: number;
  setCostPerIter: (n: number) => void;
}

export function Settings({ costPerIter, setCostPerIter }: Props) {
  const { config, demo, connection, disconnect } = useAuth();
  const [rules, setRules] = useState<Rule[]>(() => loadRules());

  useEffect(() => {
    saveRules(rules);
  }, [rules]);

  function toggle(id: number): void {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, on: !r.on } : r)));
  }

  function remove(id: number): void {
    setRules((rs) => rs.filter((r) => r.id !== id));
  }

  function addRule(): void {
    const id = (rules.reduce((m, r) => Math.max(m, r.id), 0) + 1) || 1;
    setRules((rs) => [
      ...rs,
      { id, on: true, when: "new rule", within: "—", action: 'slack.post("#general")' },
    ]);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <PanelHeader eyebrow="Workspace" title="Settings" />

      <div
        className="card"
        style={{ marginBottom: 16, padding: 18 }}
      >
        <div className="label" style={{ marginBottom: 10 }}>
          Connection
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "8px 16px",
            fontSize: 12.5,
          }}
        >
          <div className="label">Endpoint</div>
          <div className="mono" style={{ color: "var(--text-1)" }}>
            {demo ? "(demo mode — no remote endpoint)" : config?.endpoint ?? "—"}
          </div>
          <div className="label">Status</div>
          <div
            className="mono"
            style={{
              color:
                connection.status === "connected"
                  ? "var(--band-conv)"
                  : connection.status === "error"
                  ? "var(--band-osc)"
                  : "var(--text-3)",
            }}
          >
            {demo ? "demo" : connection.status}
            {connection.status === "error" ? ` · ${connection.message}` : ""}
          </div>
          {connection.status === "connected" && "customerId" in connection && connection.customerId && (
            <>
              <div className="label">Customer ID</div>
              <div className="mono" style={{ color: "var(--text-2)" }}>
                {connection.customerId}
              </div>
            </>
          )}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <Chip onClick={disconnect}>{demo ? "Exit demo" : "Disconnect"}</Chip>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 18 }}>
        <div className="label" style={{ marginBottom: 10 }}>
          Cost per iteration ($)
        </div>
        <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, marginTop: 0 }}>
          Used to convert iteration-count savings into dollar amounts on the Waste Report.
          A typical mid-tier frontier-model loop iteration costs $0.03–$0.10.
        </p>
        <input
          type="number"
          value={costPerIter}
          step="0.01"
          min="0"
          onChange={(e) => setCostPerIter(Number(e.target.value) || 0)}
          style={{
            width: 120,
            height: 32,
            background: "var(--surf-2)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            padding: "0 10px",
            fontSize: 13,
            fontFamily: "var(--mono)",
            color: "var(--text-1)",
            outline: "none",
          }}
        />
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Alert rules · {rules.filter((r) => r.on).length} active</h3>
          <Chip onClick={addRule}>
            <Icon.Bolt /> New rule
          </Chip>
        </div>
        <div
          style={{
            padding: "10px 14px",
            background: "color-mix(in oklab, var(--band-stall) 8%, transparent)",
            border: "1px solid color-mix(in oklab, var(--band-stall) 25%, transparent)",
            borderRadius: 5,
            margin: 14,
            fontSize: 11.5,
            color: "var(--text-2)",
          }}
        >
          <span className="mono" style={{ color: "var(--band-stall)" }}>
            note
          </span>{" "}
          · alert delivery (Slack / PagerDuty / Linear) is not yet wired up on the receiver.
          Rules persist locally so they can be reviewed and ported when delivery ships in v0.2.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "50px 1.4fr 100px 1.4fr 50px",
            padding: "8px 14px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surf-2)",
            fontSize: 10.5,
            fontFamily: "var(--mono)",
            color: "var(--text-3)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: 600,
          }}
        >
          <div>on</div>
          <div>when</div>
          <div>within</div>
          <div>then</div>
          <div></div>
        </div>
        {rules.map((r) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "50px 1.4fr 100px 1.4fr 50px",
              padding: "10px 14px",
              alignItems: "center",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                style={{
                  width: 30,
                  height: 16,
                  borderRadius: 8,
                  background: r.on ? "var(--accent)" : "var(--surf-3)",
                  position: "relative",
                  transition: "background 150ms ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: r.on ? 16 : 2,
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: "#fff",
                    transition: "left 150ms ease",
                  }}
                />
              </button>
            </div>
            <input
              type="text"
              value={r.when}
              onChange={(e) =>
                setRules((rs) =>
                  rs.map((x) => (x.id === r.id ? { ...x, when: e.target.value } : x)),
                )
              }
              style={inputStyle}
            />
            <input
              type="text"
              value={r.within}
              onChange={(e) =>
                setRules((rs) =>
                  rs.map((x) => (x.id === r.id ? { ...x, within: e.target.value } : x)),
                )
              }
              style={inputStyle}
            />
            <input
              type="text"
              value={r.action}
              onChange={(e) =>
                setRules((rs) =>
                  rs.map((x) => (x.id === r.id ? { ...x, action: e.target.value } : x)),
                )
              }
              style={{ ...inputStyle, color: "var(--accent)" }}
            />
            <button
              type="button"
              onClick={() => remove(r.id)}
              style={{
                color: "var(--text-3)",
                padding: 4,
                borderRadius: 4,
              }}
              title="Remove rule"
            >
              <Icon.X />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: 4,
  padding: "4px 6px",
  fontSize: 12,
  fontFamily: "var(--mono)",
  color: "var(--text-1)",
  outline: "none",
  minWidth: 0,
  width: "100%",
};
