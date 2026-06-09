// Settings panel — connection info, alert-rule editor (server-backed via
// the receiver's /v1/alerts/rules CRUD endpoints), cost-per-iteration
// default. The cron evaluator on the receiver fires webhook deliveries
// every minute against any rule whose predicate matches.

import { useEffect, useMemo, useState } from "react";
import {
  createAlertRule,
  deleteAlertRule,
  updateAlertRule,
  useAuth,
} from "../../lib/api";
import { useAlertRules } from "../../lib/data-hooks";
import { Chip, Icon, PanelHeader } from "../primitives";
import type {
  AlertOperator,
  AlertPredicate,
  AlertRule,
  AlertRulePayload,
  Outcome,
} from "../../types";

const PRESET_KEY = "loopgain-dashboard-cost-preset";
const IN_TOKENS_KEY = "loopgain-dashboard-cost-in-tokens";
const OUT_TOKENS_KEY = "loopgain-dashboard-cost-out-tokens";

// Model pricing reference table. Rates are $ per million tokens (input / output).
// Pricing last verified against public Anthropic, OpenAI, and Google pricing
// pages on 2026-05-13. Re-verify periodically — public list pricing shifts,
// and enterprise contracts may differ.
type ModelPresetId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gemini-2-5-pro"
  | "custom";

interface ModelPreset {
  id: ModelPresetId;
  label: string;
  inputRate: number | null;
  outputRate: number | null;
}

const PRESETS: ModelPreset[] = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", inputRate: 15, outputRate: 75 },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", inputRate: 3, outputRate: 15 },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", inputRate: 1, outputRate: 5 },
  { id: "gpt-4o", label: "GPT-4o", inputRate: 2.5, outputRate: 10 },
  { id: "gpt-4o-mini", label: "GPT-4o-mini", inputRate: 0.15, outputRate: 0.6 },
  { id: "gemini-2-5-pro", label: "Gemini 2.5 Pro", inputRate: 1.25, outputRate: 10 },
  { id: "custom", label: "Custom (enter $/iter manually)", inputRate: null, outputRate: null },
];

const DEFAULT_IN_TOKENS = 5000;
const DEFAULT_OUT_TOKENS = 500;

function loadPreset(): ModelPresetId {
  const v = localStorage.getItem(PRESET_KEY);
  return PRESETS.some((p) => p.id === v) ? (v as ModelPresetId) : "claude-sonnet-4-6";
}

function loadTokens(key: string, fallback: number): number {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function computeCost(p: ModelPreset, inTok: number, outTok: number): number {
  if (p.inputRate == null || p.outputRate == null) return 0;
  return (inTok / 1_000_000) * p.inputRate + (outTok / 1_000_000) * p.outputRate;
}

interface Props {
  costPerIter: number;
  setCostPerIter: (n: number) => void;
}

export function Settings({ costPerIter, setCostPerIter }: Props) {
  const { config, demo, connection, disconnect } = useAuth();

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

      {!demo && <RotateTokenNotice />}

      <CostPerIterCard costPerIter={costPerIter} setCostPerIter={setCostPerIter} />

      <AlertRulesCard />
    </div>
  );
}

// ── Alert rules editor ────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "var(--surf-2)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 12,
  fontFamily: "var(--mono)",
  color: "var(--text-1)",
  outline: "none",
  minWidth: 0,
  height: 28,
};

const OUTCOMES: ReadonlyArray<Outcome> = [
  "converged",
  "oscillating",
  "diverged",
  "max_iterations",
];

const OPERATORS: ReadonlyArray<AlertOperator> = [">", ">=", "<", "<=", "="];

function defaultPredicate(): AlertPredicate {
  return { metric: "outcome_count", outcome: "diverged", operator: ">", threshold: 3 };
}

function defaultPayload(): AlertRulePayload {
  return {
    name: "New rule",
    enabled: true,
    predicate: defaultPredicate(),
    filter: null,
    window_seconds: 300,
    cooldown_seconds: 600,
    action_type: "webhook",
    action_url: "",
  };
}

function ruleToPayload(r: AlertRule): AlertRulePayload {
  return {
    name: r.name,
    enabled: r.enabled,
    predicate: r.predicate,
    filter: r.filter,
    window_seconds: r.window_seconds,
    cooldown_seconds: r.cooldown_seconds,
    action_type: r.action_type,
    action_url: r.action_url,
  };
}

function AlertRulesCard() {
  const { config, demo } = useAuth();
  const { state, refresh } = useAlertRules();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<AlertRulePayload>(() => defaultPayload());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = useMemo(() => {
    if (state.status === "ok") return state.data.rules;
    if (state.status === "loading" && state.previous) return state.previous.rules;
    if (state.status === "error" && state.previous) return state.previous.rules;
    return [];
  }, [state]);

  function startNew() {
    setDraft(defaultPayload());
    setEditingId("new");
    setError(null);
  }

  function startEdit(r: AlertRule) {
    setDraft(ruleToPayload(r));
    setEditingId(r.id);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function save() {
    if (!config && !demo) return;
    setSubmitting(true);
    setError(null);
    try {
      if (demo) {
        // Demo mode is read-only; pretend success and refresh.
        await new Promise((r) => setTimeout(r, 200));
      } else if (editingId === "new") {
        await createAlertRule(config!, draft);
      } else if (typeof editingId === "number") {
        await updateAlertRule(config!, editingId, draft);
      }
      setEditingId(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: number) {
    if (!config || demo) return;
    if (!window.confirm("Delete this rule?")) return;
    try {
      await deleteAlertRule(config, id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleEnabled(r: AlertRule) {
    if (!config || demo) return;
    try {
      await updateAlertRule(config, r.id, { ...ruleToPayload(r), enabled: !r.enabled });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="card">
      <div className="card-h">
        <h3>Alert rules · {rules.filter((r) => r.enabled).length} active</h3>
        <Chip onClick={startNew}>
          <Icon.Bolt /> New rule
        </Chip>
      </div>

      {demo && (
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
            demo mode
          </span>{" "}
          · rules are read-only. Connect a real receiver to create, edit, and
          deliver alerts.
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "10px 14px",
            margin: 14,
            background: "color-mix(in oklab, var(--band-osc) 10%, transparent)",
            border: "1px solid color-mix(in oklab, var(--band-osc) 30%, transparent)",
            borderRadius: 5,
            fontSize: 11.5,
            color: "var(--band-osc)",
            fontFamily: "var(--mono)",
          }}
        >
          {error}
        </div>
      )}

      {rules.length === 0 && editingId !== "new" && (
        <div style={{ padding: 24, color: "var(--text-3)", fontSize: 12 }}>
          No rules yet. Click <span className="mono">New rule</span> to add one.
        </div>
      )}

      {rules.map((r) =>
        editingId === r.id ? (
          <RuleEditor
            key={r.id}
            draft={draft}
            setDraft={setDraft}
            onSave={save}
            onCancel={cancelEdit}
            submitting={submitting}
            label="Edit rule"
          />
        ) : (
          <RuleRow
            key={r.id}
            r={r}
            onEdit={() => startEdit(r)}
            onDelete={() => remove(r.id)}
            onToggle={() => toggleEnabled(r)}
            disabled={demo}
          />
        ),
      )}

      {editingId === "new" && (
        <RuleEditor
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={cancelEdit}
          submitting={submitting}
          label="New rule"
        />
      )}
    </div>
  );
}

function RuleRow({
  r,
  onEdit,
  onDelete,
  onToggle,
  disabled,
}: {
  r: AlertRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        gap: 14,
        alignItems: "center",
      }}
    >
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        title={r.enabled ? "Disable" : "Enable"}
        style={{
          width: 30,
          height: 16,
          borderRadius: 8,
          background: r.enabled ? "var(--accent)" : "var(--surf-3)",
          position: "relative",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: r.enabled ? 16 : 2,
            width: 12,
            height: 12,
            borderRadius: 6,
            background: "#fff",
          }}
        />
      </button>
      <div style={{ minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 12.5, color: "var(--text-1)" }}>
          {r.name}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4 }}>
          {describePredicateInline(r.predicate)}
          {r.filter && describeFilterInline(r.filter) && (
            <>
              {" · "}
              <span style={{ color: "var(--text-2)" }}>{describeFilterInline(r.filter)}</span>
            </>
          )}
          {" · window "}
          {fmtSecondsShort(r.window_seconds)}
          {" · cooldown "}
          {fmtSecondsShort(r.cooldown_seconds)}
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>
          → {r.action_url}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        style={{
          color: "var(--text-2)",
          padding: "4px 8px",
          borderRadius: 4,
          fontSize: 11,
          fontFamily: "var(--mono)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        title="Delete rule"
        style={{
          color: "var(--text-3)",
          padding: 4,
          borderRadius: 4,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <Icon.X />
      </button>
    </div>
  );
}

function RuleEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  submitting,
  label,
}: {
  draft: AlertRulePayload;
  setDraft: (d: AlertRulePayload) => void;
  onSave: () => void;
  onCancel: () => void;
  submitting: boolean;
  label: string;
}) {
  function setPredicate(next: AlertPredicate) {
    setDraft({ ...draft, predicate: next });
  }
  function setMetric(metric: AlertPredicate["metric"]) {
    if (metric === "outcome_count") {
      setPredicate({ metric, outcome: "diverged", operator: ">", threshold: 3 });
    } else if (metric === "rollback_count") {
      setPredicate({ metric, operator: ">", threshold: 5 });
    } else {
      setPredicate({ metric: "rollback_rate", operator: ">", threshold: 0.12 });
    }
  }

  return (
    <div
      style={{
        padding: "14px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surf-2)",
      }}
    >
      <div
        className="label"
        style={{ marginBottom: 10, color: "var(--accent)" }}
      >
        {label}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr",
          gap: "8px 12px",
          alignItems: "center",
          maxWidth: 760,
        }}
      >
        <div className="label">Name</div>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          style={inputStyle}
        />

        <div className="label">When</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={draft.predicate.metric}
            onChange={(e) => setMetric(e.target.value as AlertPredicate["metric"])}
            style={{ ...inputStyle, cursor: "pointer", minWidth: 160 }}
          >
            <option value="outcome_count">count of outcome</option>
            <option value="rollback_count">count of rollbacks</option>
            <option value="rollback_rate">rollback rate</option>
          </select>
          {draft.predicate.metric === "outcome_count" && (
            <select
              value={draft.predicate.outcome}
              onChange={(e) => {
                if (draft.predicate.metric !== "outcome_count") return;
                setPredicate({
                  ...draft.predicate,
                  outcome: e.target.value as Outcome,
                });
              }}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          <select
            value={draft.predicate.operator}
            onChange={(e) =>
              setPredicate({
                ...draft.predicate,
                operator: e.target.value as AlertOperator,
              } as AlertPredicate)
            }
            style={{ ...inputStyle, cursor: "pointer", width: 70 }}
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            type="number"
            step={draft.predicate.metric === "rollback_rate" ? 0.01 : 1}
            value={draft.predicate.threshold}
            onChange={(e) =>
              setPredicate({
                ...draft.predicate,
                threshold: Number(e.target.value),
              } as AlertPredicate)
            }
            style={{ ...inputStyle, width: 100 }}
          />
        </div>

        <div className="label">Window</div>
        <select
          value={draft.window_seconds}
          onChange={(e) => setDraft({ ...draft, window_seconds: Number(e.target.value) })}
          style={{ ...inputStyle, cursor: "pointer", maxWidth: 200 }}
        >
          <option value={60}>1 minute</option>
          <option value={300}>5 minutes</option>
          <option value={900}>15 minutes</option>
          <option value={3600}>1 hour</option>
          <option value={21600}>6 hours</option>
          <option value={86400}>24 hours</option>
        </select>

        <div className="label">Cooldown</div>
        <select
          value={draft.cooldown_seconds ?? 600}
          onChange={(e) =>
            setDraft({ ...draft, cooldown_seconds: Number(e.target.value) })
          }
          style={{ ...inputStyle, cursor: "pointer", maxWidth: 200 }}
        >
          <option value={0}>none (always re-fire)</option>
          <option value={300}>5 minutes</option>
          <option value={600}>10 minutes</option>
          <option value={1800}>30 minutes</option>
          <option value={3600}>1 hour</option>
          <option value={86400}>24 hours</option>
        </select>

        <div className="label">Filter</div>
        <FilterEditor
          value={draft.filter ?? null}
          onChange={(f) => setDraft({ ...draft, filter: f })}
        />

        <div className="label">Webhook URL</div>
        <input
          type="url"
          value={draft.action_url}
          placeholder="https://hooks.your-domain.com/loopgain"
          onChange={(e) => setDraft({ ...draft, action_url: e.target.value })}
          style={inputStyle}
        />
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={submitting || !draft.action_url || !draft.name}
          style={{
            height: 28,
            padding: "0 14px",
            borderRadius: 5,
            background: "var(--accent)",
            color: "var(--surf-0)",
            fontSize: 12,
            fontFamily: "var(--mono)",
            cursor: submitting || !draft.action_url ? "not-allowed" : "pointer",
            opacity: submitting || !draft.action_url ? 0.5 : 1,
          }}
        >
          {submitting ? "saving…" : "save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{
            height: 28,
            padding: "0 14px",
            borderRadius: 5,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-2)",
            fontSize: 12,
            fontFamily: "var(--mono)",
            cursor: "pointer",
          }}
        >
          cancel
        </button>
      </div>
    </div>
  );
}

function FilterEditor({
  value,
  onChange,
}: {
  value: { workload_id?: string | null; framework?: string | null; loop_type?: string | null; team?: string | null } | null;
  onChange: (v: typeof value) => void;
}) {
  const v = value ?? {};
  function set(key: "workload_id" | "framework" | "loop_type" | "team", str: string) {
    const next = { ...v, [key]: str || undefined };
    if (!next.workload_id && !next.framework && !next.loop_type && !next.team) {
      onChange(null);
    } else {
      onChange(next);
    }
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <input
        type="text"
        placeholder="framework"
        value={v.framework ?? ""}
        onChange={(e) => set("framework", e.target.value)}
        style={inputStyle}
      />
      <input
        type="text"
        placeholder="loop_type"
        value={v.loop_type ?? ""}
        onChange={(e) => set("loop_type", e.target.value)}
        style={inputStyle}
      />
      <input
        type="text"
        placeholder="team"
        value={v.team ?? ""}
        onChange={(e) => set("team", e.target.value)}
        style={inputStyle}
      />
      <input
        type="text"
        placeholder="workload_id"
        value={v.workload_id ?? ""}
        onChange={(e) => set("workload_id", e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

function describePredicateInline(p: AlertPredicate): string {
  switch (p.metric) {
    case "outcome_count":
      return `count(outcome=${p.outcome}) ${p.operator} ${p.threshold}`;
    case "rollback_count":
      return `count(rollback) ${p.operator} ${p.threshold}`;
    case "rollback_rate":
      return `rollback_rate ${p.operator} ${(p.threshold * 100).toFixed(0)}%`;
  }
}

function describeFilterInline(
  f: { workload_id?: string | null; framework?: string | null; loop_type?: string | null; team?: string | null },
): string {
  const parts: string[] = [];
  for (const k of ["workload_id", "framework", "loop_type", "team"] as const) {
    const v = f[k];
    if (v) parts.push(`${k}=${v}`);
  }
  return parts.join(" · ");
}

function fmtSecondsShort(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

// ── Cost per iteration ────────────────────────────────────────────────

const boxedInputStyle: React.CSSProperties = {
  height: 32,
  background: "var(--surf-2)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  padding: "0 10px",
  fontSize: 13,
  fontFamily: "var(--mono)",
  color: "var(--text-1)",
  outline: "none",
};

function CostPerIterCard({
  costPerIter,
  setCostPerIter,
}: {
  costPerIter: number;
  setCostPerIter: (n: number) => void;
}) {
  const [presetId, setPresetId] = useState<ModelPresetId>(() => loadPreset());
  const [inTokens, setInTokens] = useState<number>(() =>
    loadTokens(IN_TOKENS_KEY, DEFAULT_IN_TOKENS),
  );
  const [outTokens, setOutTokens] = useState<number>(() =>
    loadTokens(OUT_TOKENS_KEY, DEFAULT_OUT_TOKENS),
  );

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]!;
  const isCustom = preset.inputRate == null;

  // Sync computed cost to App's costPerIter on mount and whenever inputs change.
  // App.tsx persists the resulting number to its own key, so Overview/Waste pick
  // up the calibrated value even if they mount before Settings.
  useEffect(() => {
    localStorage.setItem(PRESET_KEY, presetId);
    if (!isCustom) {
      setCostPerIter(computeCost(preset, inTokens, outTokens));
    }
    // setCostPerIter is a parent-defined function with an unstable identity;
    // omitted from deps to avoid re-firing on unrelated parent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, inTokens, outTokens]);

  useEffect(() => {
    localStorage.setItem(IN_TOKENS_KEY, String(inTokens));
  }, [inTokens]);

  useEffect(() => {
    localStorage.setItem(OUT_TOKENS_KEY, String(outTokens));
  }, [outTokens]);

  return (
    <div className="card" style={{ marginBottom: 16, padding: 18 }}>
      <div className="label" style={{ marginBottom: 10 }}>
        Cost per iteration
      </div>
      <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, marginTop: 0, marginBottom: 14 }}>
        Used to convert iteration-count savings into dollar amounts on the Waste
        Report. Pick the model your loops use and we'll estimate the per-iteration
        cost from public pricing — telemetry doesn't carry model or token info, so
        this is a workload-level estimate.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "10px 14px",
          alignItems: "center",
          maxWidth: 560,
        }}
      >
        <div className="label">Model</div>
        <select
          value={presetId}
          onChange={(e) => setPresetId(e.target.value as ModelPresetId)}
          style={{ ...boxedInputStyle, width: "100%", fontFamily: "inherit", cursor: "pointer" }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {isCustom ? (
          <>
            <div className="label">$ per iter</div>
            <input
              type="number"
              value={costPerIter}
              step="0.01"
              min="0"
              onChange={(e) => setCostPerIter(Number(e.target.value) || 0)}
              style={{ ...boxedInputStyle, width: 120 }}
            />
          </>
        ) : (
          <>
            <div className="label">Estimated</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span
                className="mono"
                style={{ fontSize: 16, color: "var(--text-1)", letterSpacing: "-0.01em" }}
              >
                ${costPerIter.toFixed(4)}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                per iter
              </span>
            </div>
          </>
        )}
      </div>

      {!isCustom && (
        <details style={{ marginTop: 14 }}>
          <summary
            style={{
              cursor: "pointer",
              userSelect: "none",
              fontSize: 12,
              color: "var(--text-2)",
              padding: "4px 0",
            }}
          >
            Adjust token estimates
          </summary>
          <div
            style={{
              marginTop: 10,
              padding: 12,
              background: "var(--surf-2)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              display: "grid",
              gridTemplateColumns: "auto 110px 1fr",
              gap: "10px 12px",
              alignItems: "center",
              maxWidth: 560,
            }}
          >
            <div className="label">Input tokens / iter</div>
            <input
              type="number"
              value={inTokens}
              min="0"
              step="100"
              onChange={(e) => setInTokens(Math.max(0, Number(e.target.value) || 0))}
              style={{ ...boxedInputStyle, width: "100%" }}
            />
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
              × ${preset.inputRate}/M = ${((inTokens / 1_000_000) * (preset.inputRate ?? 0)).toFixed(4)}
            </div>
            <div className="label">Output tokens / iter</div>
            <input
              type="number"
              value={outTokens}
              min="0"
              step="50"
              onChange={(e) => setOutTokens(Math.max(0, Number(e.target.value) || 0))}
              style={{ ...boxedInputStyle, width: "100%" }}
            />
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
              × ${preset.outputRate}/M = ${((outTokens / 1_000_000) * (preset.outputRate ?? 0)).toFixed(4)}
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5, margin: "10px 0 0" }}>
            Defaults ({DEFAULT_IN_TOKENS} in / {DEFAULT_OUT_TOKENS} out) are rough
            order-of-magnitude estimates. Token volume is the dominant cost driver — set
            these from a sample of real iterations for a credible Waste Report.
          </p>
        </details>
      )}
    </div>
  );
}

// ── Rotate token notice ───────────────────────────────────────────────
//
// Self-serve rotation over HTTP was removed (2026-05-14). A leaked token
// would otherwise let an attacker rotate the credential and lock the
// legitimate owner out without recourse. Rotation now happens operator-side
// via the rotate-token.mjs script in the telemetry-receiver repo.

function RotateTokenNotice() {
  return (
    <div className="card" style={{ marginBottom: 16, padding: 18 }}>
      <div className="label" style={{ marginBottom: 8 }}>
        Bearer token
      </div>
      <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, margin: 0 }}>
        To rotate this account's token, email{" "}
        <span className="mono" style={{ color: "var(--text-2)" }}>
          hello@loopgain.ai
        </span>
        . Self-serve rotation over HTTP is intentionally disabled so a leaked
        token can't be used to lock you out.
      </p>
    </div>
  );
}
