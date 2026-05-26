// Alerts panel — recent delivery audit log + active-rule summary.
//
// Rule editing lives in Settings. This panel is a read-only view into what
// the receiver's scheduled cron evaluator did with those rules: which
// matched, when they fired, whether the webhook delivered, and a one-line
// reason on failure.

import { useMemo } from "react";
import { useAlertDeliveries, useAlertRules } from "../../lib/data-hooks";
import { Chip, KPI, PanelHeader } from "../primitives";
import { Loaded } from "./PanelState";
import { fmtAbsTsExact, fmtInt, fmtRel } from "../../lib/format";
import type { AlertDelivery, AlertRule } from "../../types";
import type { RouteId } from "../shell";

interface Props {
  setRoute: (r: RouteId) => void;
}

export function Alerts({ setRoute }: Props) {
  const rules = useAlertRules();
  const deliveries = useAlertDeliveries({ pollMs: 30_000 });

  return (
    <div style={{ padding: 24 }}>
      <PanelHeader title="Alerts" />

      <Loaded state={deliveries.state}>
        {(d) => (
          <Loaded state={rules.state}>
            {(r) => (
              <AlertsBody
                rules={r.rules}
                deliveries={d.deliveries}
                setRoute={setRoute}
              />
            )}
          </Loaded>
        )}
      </Loaded>
    </div>
  );
}

function AlertsBody({
  rules,
  deliveries,
  setRoute,
}: {
  rules: ReadonlyArray<AlertRule>;
  deliveries: ReadonlyArray<AlertDelivery>;
  setRoute: (r: RouteId) => void;
}) {
  const enabledCount = rules.filter((r) => r.enabled).length;
  const last24h = useMemo(() => {
    const since = Math.floor(Date.now() / 1000) - 86400;
    return deliveries.filter((d) => d.fired_at >= since);
  }, [deliveries]);
  const sent24 = last24h.filter((d) => d.delivery_status === "sent").length;
  const failed24 = last24h.filter((d) => d.delivery_status === "failed").length;
  const skipped24 = last24h.filter(
    (d) => d.delivery_status === "skipped_cooldown",
  ).length;

  return (
    <>
      <div className="card eta-kpi-strip" style={{ padding: 0, marginBottom: 16 }}>
        {[
          { label: "Active rules", value: fmtInt(enabledCount), sub: `${rules.length} configured` },
          { label: "Sent · 24h", value: fmtInt(sent24), sub: "delivered to webhook" },
          {
            label: "Failed · 24h",
            value: fmtInt(failed24),
            sub: "non-2xx or network",
            accent: failed24 > 0 ? "var(--band-osc)" : undefined,
          },
          {
            label: "Skipped · 24h",
            value: fmtInt(skipped24),
            sub: "in cooldown when matched",
          },
        ].map((k, i) => (
          <div
            key={i}
            style={{
              padding: 18,
              borderLeft: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <KPI label={k.label} value={k.value} sub={k.sub} accent={k.accent} />
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <div className="card" style={{ padding: 0 }}>
          <div className="card-h">
            <h3>Delivery history · last 200</h3>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
              {fmtInt(deliveries.length)} rows
            </span>
          </div>
          {deliveries.length === 0 ? (
            <div style={{ padding: 24, color: "var(--text-3)", fontSize: 12 }}>
              No alerts have fired yet. Rules evaluate every minute.
            </div>
          ) : (
            <div style={{ maxHeight: 600, overflow: "auto" }}>
              {deliveries.map((d) => (
                <DeliveryRow key={d.id} d={d} />
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="card-h">
            <h3>Active rules</h3>
            <Chip onClick={() => setRoute("settings")}>Edit</Chip>
          </div>
          {rules.length === 0 ? (
            <div style={{ padding: 24, color: "var(--text-3)", fontSize: 12 }}>
              No rules yet.{" "}
              <button
                type="button"
                onClick={() => setRoute("settings")}
                style={{ color: "var(--accent)", textDecoration: "underline" }}
              >
                Configure
              </button>{" "}
              your first one in Settings.
            </div>
          ) : (
            rules.map((r) => <RuleSummary key={r.id} r={r} />)
          )}
        </div>
      </div>
    </>
  );
}

function DeliveryRow({ d }: { d: AlertDelivery }) {
  const color =
    d.delivery_status === "sent"
      ? "var(--band-conv)"
      : d.delivery_status === "failed"
      ? "var(--band-osc)"
      : "var(--text-3)";
  const ms = d.fired_at * 1000;
  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 12,
        alignItems: "center",
      }}
      title={fmtAbsTsExact(d.fired_at)}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: color,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>
            {d.rule_name}
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
            {fmtRel(ms)}
          </span>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>
          <span style={{ color }}>{d.delivery_status}</span>
          {d.delivery_status_code != null && (
            <>
              {" · "}
              <span>{d.delivery_status_code}</span>
            </>
          )}
          {" · matched "}
          <span style={{ color: "var(--text-2)" }}>
            {Number.isInteger(d.match_value) ? d.match_value : d.match_value.toFixed(3)}
          </span>{" "}
          ({fmtInt(d.match_count)} events)
          {d.delivery_error && (
            <>
              {" · "}
              <span style={{ color: "var(--band-osc)" }}>{d.delivery_error}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleSummary({ r }: { r: AlertRule }) {
  const desc = describePredicate(r);
  const filterStr = describeFilter(r);
  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>
          {r.name}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: r.enabled ? "var(--band-conv)" : "var(--text-3)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {r.enabled ? "on" : "off"}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4 }}>
        {desc}
        {filterStr && (
          <>
            {" · "}
            <span style={{ color: "var(--text-2)" }}>{filterStr}</span>
          </>
        )}
      </div>
      <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>
        window {fmtSeconds(r.window_seconds)} · cooldown {fmtSeconds(r.cooldown_seconds)}
        {r.last_fired_at && ` · last fired ${fmtRel(r.last_fired_at * 1000)}`}
      </div>
    </div>
  );
}

export function describePredicate(r: AlertRule): string {
  const p = r.predicate;
  switch (p.metric) {
    case "outcome_count":
      return `count(outcome=${p.outcome}) ${p.operator} ${p.threshold}`;
    case "rollback_count":
      return `count(rollback) ${p.operator} ${p.threshold}`;
    case "rollback_rate":
      return `rollback_rate ${p.operator} ${(p.threshold * 100).toFixed(0)}%`;
    case "gain_margin_min":
      return `any gain_margin ${p.operator} ${p.threshold}`;
  }
}

export function describeFilter(r: AlertRule): string {
  if (!r.filter) return "";
  const parts: string[] = [];
  for (const k of ["workload_id", "framework", "loop_type", "team"] as const) {
    const v = r.filter[k];
    if (v) parts.push(`${k}=${v}`);
  }
  return parts.join(" · ");
}

export function fmtSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
