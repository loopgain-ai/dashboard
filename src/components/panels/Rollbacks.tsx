// Panel 5 — Rollback Log.
//
// Real source: /v1/events?rollbacks_only=true. Each row is one rollback-triggered
// loop event. Audit hash is a real SHA-256 of the stable triple
// (customer_id, workload_id, timestamp_hour, outcome) computed on-the-fly.

import { useMemo, useState } from "react";
import { useEvents, useStats } from "../../lib/data-hooks";
import { Chip, Icon, PanelHeader, StatePill } from "../primitives";
import { Loaded } from "./PanelState";
import { bandFromEvent } from "../../lib/bands";
import { fmtAbsTs, fmtAbsTsExact, fmtInt } from "../../lib/format";
import type { Band, LoopEvent, Outcome } from "../../types";

interface Props {
  pollMs?: number;
}

const TRIG_BANDS: ReadonlyArray<Band> = ["STALLING", "OSCILLATING", "DIVERGING"];

export function Rollbacks({ pollMs }: Props) {
  const events = useEvents({ rollbacksOnly: true, pollMs });
  const stats = useStats({ pollMs });
  return (
    <div style={{ padding: 24 }}>
      <Loaded state={stats.state}>
        {(statsData) => (
          <Loaded state={events.state}>
            {(eventsData) => (
              <RollbacksBody
                events={eventsData.events}
                customerId={statsData.customer_id}
              />
            )}
          </Loaded>
        )}
      </Loaded>
    </div>
  );
}

function RollbacksBody({
  events,
  customerId,
}: {
  events: ReadonlyArray<LoopEvent>;
  customerId: string;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [trigFilter, setTrigFilter] = useState<Band | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | null>(null);

  const outcomes = useMemo(() => {
    const set = new Set<Outcome>();
    for (const e of events) set.add(e.outcome);
    return Array.from(set);
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (trigFilter && bandFromEvent(e) !== trigFilter) return false;
      if (outcomeFilter && e.outcome !== outcomeFilter) return false;
      return true;
    });
  }, [events, trigFilter, outcomeFilter]);

  function toggle(i: number): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function exportCsv(): void {
    const header = [
      "timestamp",
      "workload_id",
      "outcome",
      "iterations_used",
      "gain_margin",
      "profile_max",
      "savings_vs_fixed_cap",
      "library_version",
    ].join(",");
    const lines = filtered.map((e) =>
      [
        fmtAbsTsExact(e.timestamp_hour),
        e.workload_id ?? "",
        e.outcome,
        e.iterations_used,
        e.gain_margin ?? "",
        e.profile_max ?? "",
        e.savings_vs_fixed_cap ?? "",
        e.library_version,
      ].join(","),
    );
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loopgain-rollbacks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson(): void {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loopgain-rollbacks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PanelHeader
        eyebrow="Panel 05"
        title="Rollback Log"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <Chip icon={<Icon.Download />} onClick={exportCsv}>
              CSV
            </Chip>
            <Chip icon={<Icon.Download />} onClick={exportJson}>
              JSON
            </Chip>
          </div>
        }
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <span className="label" style={{ marginRight: 4 }}>
          Trigger band
        </span>
        {TRIG_BANDS.map((b) => (
          <Chip
            key={b}
            on={trigFilter === b}
            onClick={() => setTrigFilter(trigFilter === b ? null : b)}
          >
            {b}
          </Chip>
        ))}
        {outcomes.length > 0 && (
          <>
            <span style={{ width: 12 }} />
            <span className="label" style={{ marginRight: 4 }}>
              Outcome
            </span>
            {outcomes.map((o) => (
              <Chip
                key={o}
                on={outcomeFilter === o}
                onClick={() => setOutcomeFilter(outcomeFilter === o ? null : o)}
              >
                {String(o)}
              </Chip>
            ))}
          </>
        )}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          className="rollback-grid"
          style={{
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
          <div />
          <div className="rb-ts">timestamp</div>
          <div>workload</div>
          <div>trig band</div>
          <div style={{ textAlign: "right" }}>iter</div>
          <div className="rb-gm" style={{ textAlign: "right" }}>GM</div>
          <div className="rb-abmax" style={{ textAlign: "right" }}>Aβ_max</div>
          <div className="rb-saved" style={{ textAlign: "right" }}>saved</div>
        </div>

        <div style={{ maxHeight: "60vh", overflow: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-3)", fontSize: 12, textAlign: "center" }}>
              No rollback events in the selected window.
            </div>
          )}
          {filtered.map((r, i) => {
            const band = bandFromEvent(r);
            const isOpen = expanded.has(i);
            return (
              <div key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                <div
                  className="rollback-grid"
                  onClick={() => toggle(i)}
                  style={{
                    padding: "6px 14px",
                    alignItems: "center",
                    cursor: "pointer",
                    background: isOpen ? "var(--surf-2)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      color: "var(--text-3)",
                      transform: isOpen ? "rotate(90deg)" : "none",
                      transition: "transform 120ms ease",
                    }}
                  >
                    <Icon.Chevron />
                  </div>
                  <div className="mono rb-ts" style={{ fontSize: 11, color: "var(--text-2)" }}>
                    {fmtAbsTs(r.timestamp_hour)}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 12,
                      color: "var(--text-1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {r.workload_id ?? "—"}
                  </div>
                  <div>
                    <StatePill band={band} size="sm" />
                  </div>
                  <div className="mono" style={{ textAlign: "right", fontSize: 12, color: "var(--text-1)" }}>
                    {r.iterations_used}
                  </div>
                  <div
                    className="mono rb-gm"
                    style={{
                      textAlign: "right",
                      fontSize: 12,
                      color:
                        r.gain_margin != null && r.gain_margin < 1.0
                          ? "var(--band-osc)"
                          : r.gain_margin != null && r.gain_margin < 1.2
                          ? "var(--band-stall)"
                          : "var(--text-1)",
                    }}
                  >
                    {r.gain_margin != null ? r.gain_margin.toFixed(2) : "—"}
                  </div>
                  <div className="mono rb-abmax" style={{ textAlign: "right", fontSize: 12, color: "var(--text-1)" }}>
                    {r.profile_max != null ? r.profile_max.toFixed(3) : "—"}
                  </div>
                  <div className="mono rb-saved" style={{ textAlign: "right", fontSize: 12, color: "var(--band-conv)" }}>
                    {r.savings_vs_fixed_cap != null ? `${fmtInt(r.savings_vs_fixed_cap)} iter` : "—"}
                  </div>
                </div>

                {isOpen && <RollbackDetail event={r} customerId={customerId} />}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function RollbackDetail({ event, customerId }: { event: LoopEvent; customerId: string }) {
  const [hash, setHash] = useState<string | null>(null);
  useMemo(() => {
    const payload = `${customerId}|${event.workload_id ?? ""}|${event.timestamp_hour}|${event.outcome}`;
    if (crypto?.subtle) {
      const data = new TextEncoder().encode(payload);
      crypto.subtle.digest("SHA-256", data).then((buf) => {
        const hex = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        setHash(hex);
      });
    }
  }, [customerId, event.workload_id, event.timestamp_hour, event.outcome]);

  return (
    <div
      style={{
        padding: "14px 18px 16px 38px",
        background: "var(--surf-2)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 6, columnGap: 14, fontSize: 11.5 }}>
          <div className="label">Outcome</div>
          <div className="mono" style={{ color: "var(--text-1)" }}>
            {event.outcome}
          </div>
          <div className="label">Iterations used</div>
          <div className="mono" style={{ color: "var(--text-1)" }}>
            {event.iterations_used}
          </div>
          <div className="label">Aβ_max</div>
          <div className="mono" style={{ color: "var(--text-1)" }}>
            {event.profile_max != null ? event.profile_max.toFixed(4) : "—"}
          </div>
          <div className="label">Gain margin</div>
          <div className="mono" style={{ color: "var(--text-1)" }}>
            {event.gain_margin != null ? event.gain_margin.toFixed(3) : "—"}
          </div>
          <div className="label">Library</div>
          <div className="mono" style={{ color: "var(--text-1)" }}>
            loopgain v{event.library_version}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 6, columnGap: 14, fontSize: 11.5 }}>
          <div className="label">Action taken</div>
          <div className="mono" style={{ color: "var(--text-1)" }}>
            rollback_to_best()
          </div>
          <div className="label">Iterations saved</div>
          <div className="mono" style={{ color: "var(--band-conv)" }}>
            {event.savings_vs_fixed_cap != null
              ? `${fmtInt(event.savings_vs_fixed_cap)}`
              : "—"}
          </div>
          <div className="label">Customer</div>
          <div className="mono" style={{ color: "var(--text-3)", fontSize: 10.5 }}>
            {customerId}
          </div>
          <div className="label">Audit hash</div>
          <div className="mono" style={{ color: "var(--text-3)", fontSize: 10.5, wordBreak: "break-all" }}>
            {hash ? `sha256:${hash}` : "computing…"}
          </div>
        </div>
      </div>
    </div>
  );
}
