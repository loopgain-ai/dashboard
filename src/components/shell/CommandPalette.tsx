import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../primitives";
import { NAV, type RouteId, loopRouteId } from "./routes";
import { useAuth } from "../../lib/api";

interface Command {
  group: string;
  label: string;
  hint?: string;
  action: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  setRoute: (r: RouteId) => void;
  workloads: ReadonlyArray<{ workload_id: string | null; count: number }>;
  toggleTheme: () => void;
  disconnect: () => void;
}

export function CommandPalette({
  open,
  onClose,
  setRoute,
  workloads,
  toggleTheme,
  disconnect,
}: Props) {
  const { demo, bench } = useAuth();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    return;
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const navs: Command[] = NAV.map((n) => ({
      group: "Navigate",
      label: `Go to ${n.label}`,
      hint: n.kbd,
      action: () => setRoute(n.id),
    }));
    navs.push({
      group: "Navigate",
      label: "Go to Settings",
      hint: "g s",
      action: () => setRoute("settings"),
    });
    const loops: Command[] = workloads
      .filter((w): w is { workload_id: string; count: number } => Boolean(w.workload_id))
      .slice(0, 80)
      .map((w) => ({
        group: "Workloads",
        label: w.workload_id,
        hint: `${w.count} runs`,
        action: () => setRoute(loopRouteId(w.workload_id)),
      }));
    const actions: Command[] = [
      {
        group: "Actions",
        label: "Toggle dark / light theme",
        action: toggleTheme,
      },
      // Switch between the public projection (/demo) and the public
      // bench tenant (/benchmark). Both are URL-driven; navigating
      // changes the mode.
      {
        group: "Actions",
        label: demo ? "View benchmark (receipts)" : "View demo (projection)",
        action: () => window.location.assign(demo ? "/benchmark" : "/demo"),
      },
      ...(bench
        ? [
            {
              group: "Actions",
              label: "View demo (projection)",
              action: () => window.location.assign("/demo"),
            },
          ]
        : []),
      {
        group: "Actions",
        label: "Disconnect",
        action: disconnect,
      },
    ];
    return [...navs, ...actions, ...loops];
  }, [setRoute, workloads, toggleTheme, disconnect, demo, bench]);

  const filtered = useMemo(() => {
    if (!q) return commands;
    const lc = q.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(lc) ||
        c.group.toLowerCase().includes(lc) ||
        (c.hint ?? "").toLowerCase().includes(lc),
    );
  }, [commands, q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!open) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(filtered.length - 1, s + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      }
      if (e.key === "Enter") {
        const c = filtered[sel];
        if (c) {
          c.action();
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, sel, onClose]);

  if (!open) return null;

  const grouped: Array<{ name: string; items: Array<Command & { _idx: number }> }> = [];
  const seen: Record<string, Array<Command & { _idx: number }>> = {};
  filtered.forEach((c, i) => {
    if (!seen[c.group]) {
      seen[c.group] = [];
      grouped.push({ name: c.group, items: seen[c.group]! });
    }
    seen[c.group]!.push({ ...c, _idx: i });
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in oklab, var(--bg-0) 70%, transparent)",
        backdropFilter: "blur(4px)",
        zIndex: 200,
        display: "flex",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 620,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "70vh",
          background: "var(--surf-1)",
          border: "1px solid var(--border-2)",
          borderRadius: 10,
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Icon.Search />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder="Search workloads, jump to panel, run command…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              fontFamily: "var(--sans)",
              color: "var(--text-1)",
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "6px 0" }}>
          {grouped.map((g) => (
            <div key={g.name}>
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                }}
              >
                {g.name}
              </div>
              {g.items.map((c) => (
                <div
                  key={c._idx + c.label}
                  onMouseEnter={() => setSel(c._idx)}
                  onClick={() => {
                    c.action();
                    onClose();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 16px",
                    cursor: "pointer",
                    background: sel === c._idx ? "var(--surf-3)" : "transparent",
                    fontSize: 12.5,
                  }}
                >
                  <Icon.Bolt />
                  <span className="mono" style={{ color: "var(--text-1)" }}>
                    {c.label}
                  </span>
                  <span style={{ flex: 1 }} />
                  {c.hint && (
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>
                      {c.hint}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 20, color: "var(--text-3)", fontSize: 12 }}>No matches.</div>
          )}
        </div>
        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 14,
            color: "var(--text-3)",
            fontSize: 11,
          }}
        >
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> navigate
          </span>
          <span>
            <span className="kbd">↵</span> select
          </span>
          <span>
            <span className="kbd">esc</span> close
          </span>
          <span style={{ flex: 1 }} />
          <span className="mono">{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}
