// Loop Health Map — treemap of recent loop events, colored by classified band.
//
// Reality alignment: telemetry stores `workload_id` as the only grouping
// dimension, so the prototype's loop-type / framework / team filters are
// replaced with workload filters + outcome filters.

import { useMemo, useState } from "react";
import { useEvents, useStats } from "../../lib/data-hooks";
import { BANDS, BAND_COLOR, bandFromEvent } from "../../lib/bands";
import { Chip, PanelHeader, Tooltip } from "../primitives";
import { fmtAbsTs, fmtInt, truncate } from "../../lib/format";
import { Loaded } from "./PanelState";
import { loopRouteId, type RouteId } from "../shell";
import type { Band, LoopEvent } from "../../types";

interface Props {
  setRoute: (r: RouteId) => void;
  pollMs?: number;
}

type SizeBy = "throughput" | "savings";

export function HealthMap({ setRoute, pollMs }: Props) {
  const events = useEvents({ pollMs });
  const stats = useStats({ pollMs });
  return (
    <div style={{ padding: 24 }}>
      <Loaded state={events.state}>
        {(eventsData) => (
          <Loaded state={stats.state}>
            {(statsData) => (
              <HealthMapBody
                events={eventsData.events}
                workloads={statsData.workloads}
                setRoute={setRoute}
              />
            )}
          </Loaded>
        )}
      </Loaded>
    </div>
  );
}

function HealthMapBody({
  events,
  workloads,
  setRoute,
}: {
  events: ReadonlyArray<LoopEvent>;
  workloads: ReadonlyArray<{ workload_id: string | null; count: number }>;
  setRoute: (r: RouteId) => void;
}) {
  const [sizeBy, setSizeBy] = useState<SizeBy>("throughput");
  const [bandFilter, setBandFilter] = useState<Band | null>(null);
  const [workloadFilter, setWorkloadFilter] = useState<string | null>(null);
  const [hover, setHover] = useState<{ tile: Tile; x: number; y: number } | null>(null);

  const visibleEvents = useMemo(() => {
    return events.filter((e) => {
      if (workloadFilter && e.workload_id !== workloadFilter) return false;
      if (bandFilter && bandFromEvent(e) !== bandFilter) return false;
      return true;
    });
  }, [events, workloadFilter, bandFilter]);

  const tiles = useMemo(() => layout(visibleEvents, sizeBy), [visibleEvents, sizeBy]);

  const cluster = useMemo(() => detectCluster(events), [events]);

  return (
    <>
      <PanelHeader
        eyebrow="Panel 01"
        title="Loop Health Map"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="label">Size by</span>
            <div
              style={{
                display: "flex",
                border: "1px solid var(--border)",
                borderRadius: 5,
                overflow: "hidden",
              }}
            >
              {(
                [
                  { id: "throughput" as const, label: "iterations" },
                  { id: "savings" as const, label: "savings" },
                ]
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSizeBy(o.id)}
                  style={{
                    height: 26,
                    padding: "0 10px",
                    fontSize: 11,
                    fontFamily: "var(--mono)",
                    color: sizeBy === o.id ? "var(--text-1)" : "var(--text-3)",
                    background: sizeBy === o.id ? "var(--surf-3)" : "transparent",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {cluster && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            background: "color-mix(in oklab, var(--band-osc) 8%, transparent)",
            border: "1px solid color-mix(in oklab, var(--band-osc) 35%, transparent)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            className="pulse-glow"
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "var(--band-osc)",
            }}
          />
          <div style={{ fontSize: 12, color: "var(--text-1)" }}>
            <span className="mono" style={{ color: "var(--band-osc)" }}>
              cluster_detected
            </span>
            {" · "}
            <span className="mono">{cluster.count}</span> loops on workload{" "}
            <span className="mono" style={{ color: "var(--text-1)" }}>
              {cluster.workload}
            </span>{" "}
            entered STALLING/OSCILLATING/DIVERGING in last 24h
          </div>
          <span style={{ flex: 1 }} />
          <Chip onClick={() => setWorkloadFilter(cluster.workload)}>Isolate</Chip>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        <span className="label" style={{ alignSelf: "center", marginRight: 6 }}>
          Workload
        </span>
        <Chip
          on={workloadFilter === null}
          onClick={() => setWorkloadFilter(null)}
        >
          all
        </Chip>
        {workloads
          .filter((w): w is { workload_id: string; count: number } => Boolean(w.workload_id))
          .slice(0, 14)
          .map((w) => (
            <Chip
              key={w.workload_id}
              on={workloadFilter === w.workload_id}
              onClick={() =>
                setWorkloadFilter(workloadFilter === w.workload_id ? null : w.workload_id)
              }
            >
              {w.workload_id} ({w.count})
            </Chip>
          ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        <span className="label" style={{ alignSelf: "center", marginRight: 6 }}>
          Band
        </span>
        {BANDS.map((b) => (
          <Chip
            key={b.id}
            on={bandFilter === b.id}
            onClick={() => setBandFilter(bandFilter === b.id ? null : b.id)}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: BAND_COLOR[b.id],
              }}
            />
            {b.short}
          </Chip>
        ))}
      </div>

      <div
        className="card"
        style={{ padding: 0, position: "relative", overflow: "hidden" }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
            showing <span style={{ color: "var(--text-1)" }}>{fmtInt(visibleEvents.length)}</span>{" "}
            of {fmtInt(events.length)} events · cells sized by {sizeBy}
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 10.5 }}>
            {BANDS.map((b) => (
              <div
                key={b.id}
                style={{ display: "flex", alignItems: "center", gap: 5 }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: BAND_COLOR[b.id],
                  }}
                />
                <span
                  className="mono"
                  style={{ color: "var(--text-2)", letterSpacing: "0.04em" }}
                >
                  {b.short.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          {visibleEvents.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-3)",
                fontSize: 12,
              }}
            >
              No events match the current filters.
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${tiles.W} ${tiles.H}`}
              width="100%"
              style={{ display: "block", background: "var(--bg-1)" }}
              onMouseLeave={() => setHover(null)}
            >
              {tiles.tiles.map((t, i) => {
                const color = BAND_COLOR[t.band];
                const showLabel = t.w > 100 && t.h > 40;
                return (
                  <g
                    key={i}
                    onMouseEnter={() => setHover({ tile: t, x: t.x + t.w / 2, y: t.y })}
                    onClick={() => {
                      if (t.workload_id) setRoute(loopRouteId(t.workload_id));
                    }}
                    style={{ cursor: t.workload_id ? "pointer" : "default" }}
                  >
                    <rect
                      x={t.x + 1}
                      y={t.y + 1}
                      width={t.w - 2}
                      height={t.h - 2}
                      className="lg-health-tile"
                      fill={color}
                      fillOpacity={hover && hover.tile === t ? 0.55 : 0.4}
                      stroke={color}
                      strokeOpacity="0.85"
                      strokeWidth="1"
                    />
                    {showLabel && (
                      <g>
                        <text
                          x={t.x + 8}
                          y={t.y + 16}
                          fontFamily="var(--mono)"
                          fontSize="10"
                          fill="var(--text-1)"
                          fontWeight="500"
                        >
                          {truncate(t.workload_id ?? "—", 22)}
                        </text>
                        <text
                          x={t.x + 8}
                          y={t.y + 30}
                          fontFamily="var(--mono)"
                          fontSize="9.5"
                          fill="var(--text-2)"
                        >
                          {t.outcome} · {t.iterations} iter
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
          {hover && (
            <Tooltip x={hover.x} y={hover.y}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ color: "var(--text-1)" }}>
                  {hover.tile.workload_id ?? "(no workload_id)"}
                </div>
                <div style={{ color: "var(--text-3)" }}>
                  {hover.tile.outcome} · {hover.tile.iterations} iter
                </div>
                <div style={{ color: "var(--text-2)" }}>
                  Aβ_max{" "}
                  <span style={{ color: "var(--text-1)" }}>
                    {hover.tile.abMax != null ? hover.tile.abMax.toFixed(3) : "—"}
                  </span>
                  &nbsp;· GM{" "}
                  <span style={{ color: "var(--text-1)" }}>
                    {hover.tile.gm != null ? hover.tile.gm.toFixed(2) : "—"}
                  </span>
                </div>
                <div style={{ color: "var(--text-3)", fontSize: 10 }}>
                  {fmtAbsTs(hover.tile.ts)}
                </div>
              </div>
            </Tooltip>
          )}
        </div>
      </div>
    </>
  );
}

// ── Tile layout (squarify-lite) ──────────────────────────────────────

interface Tile {
  workload_id: string | null;
  band: Band;
  outcome: string;
  iterations: number;
  abMax: number | null;
  gm: number | null;
  ts: number;
  weight: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

function layout(
  events: ReadonlyArray<LoopEvent>,
  sizeBy: SizeBy,
): { W: number; H: number; tiles: Tile[] } {
  const W = 1080;
  const H = 580;
  if (events.length === 0) return { W, H, tiles: [] };

  const items = events.map<Tile>((e) => {
    const weight =
      sizeBy === "savings"
        ? Math.max(1, e.savings_vs_fixed_cap ?? 1)
        : Math.max(1, e.iterations_used);
    return {
      workload_id: e.workload_id,
      band: bandFromEvent(e),
      outcome: e.outcome,
      iterations: e.iterations_used,
      abMax: e.profile_max,
      gm: e.gain_margin,
      ts: e.timestamp_hour * 1000,
      weight,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    };
  });
  items.sort((a, b) => b.weight - a.weight);
  const totalRemaining = () => items.slice(i).reduce((s, x) => s + x.weight, 0);

  let y = 0;
  let remH = H;
  let i = 0;
  const total = items.reduce((s, x) => s + x.weight, 0);
  if (total === 0) return { W, H, tiles: [] };

  while (i < items.length) {
    const rowItems: Tile[] = [];
    let rowSum = 0;
    let count = 0;
    while (i + count < items.length && count < 12) {
      const w = items[i + count]!.weight;
      rowSum += w;
      rowItems.push(items[i + count]!);
      count++;
      if (rowItems.length >= 4) {
        const rem = totalRemaining();
        if ((rowSum / rem) * W > W * 0.45) break;
      }
    }
    const rowFrac = rowSum / Math.max(1, totalRemaining());
    const rowHActual = remH * rowFrac;
    let cx = 0;
    for (const it of rowItems) {
      const w = (it.weight / rowSum) * W;
      it.x = cx;
      it.y = y;
      it.w = w;
      it.h = rowHActual;
      cx += w;
    }
    y += rowHActual;
    remH -= rowHActual;
    i += rowItems.length;
    if (remH <= 1) break;
  }
  return { W, H, tiles: items.slice(0, i) };
}

// Cluster detection: any workload with ≥3 STALLING/OSCILLATING/DIVERGING in last 24h.
function detectCluster(
  events: ReadonlyArray<LoopEvent>,
): { workload: string; count: number } | null {
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600;
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.timestamp_hour < cutoff) continue;
    if (!e.workload_id) continue;
    const band = bandFromEvent(e);
    if (band === "OSCILLATING" || band === "DIVERGING" || band === "STALLING") {
      counts.set(e.workload_id, (counts.get(e.workload_id) ?? 0) + 1);
    }
  }
  let top: { workload: string; count: number } | null = null;
  for (const [workload, count] of counts) {
    if (count >= 3 && (!top || count > top.count)) {
      top = { workload, count };
    }
  }
  return top;
}
