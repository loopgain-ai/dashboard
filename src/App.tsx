// App root: routing, theme/density, ⌘K palette, g-prefix keybindings,
// live-mode polling cadence, and the auth gate that swaps in EmptyState
// when no endpoint is configured.

import { useEffect, useMemo, useState } from "react";
import { AuthContext, useAuthProvider } from "./lib/api";
import { FilterContext, useFiltersProvider } from "./lib/filters";
import { useStats } from "./lib/data-hooks";
import { ConnectDialog } from "./components/auth/ConnectDialog";
import {
  CommandPalette,
  FilterBar,
  NAV,
  Sidebar,
  TopBar,
  isLoopRoute,
  loopFromRoute,
  timeRangeHours,
  type RouteId,
  type TimeRange,
} from "./components/shell";
import { Overview } from "./components/panels/Overview";
import { HealthMap } from "./components/panels/HealthMap";
import { Convergence } from "./components/panels/Convergence";
import { Waste } from "./components/panels/Waste";
import { GainMargin } from "./components/panels/GainMargin";
import { Rollbacks } from "./components/panels/Rollbacks";
import { ETAAccuracy } from "./components/panels/ETAAccuracy";
import { LoopDetail } from "./components/panels/LoopDetail";
import { Alerts } from "./components/panels/Alerts";
import { Settings } from "./components/panels/Settings";
import { EmptyState } from "./components/panels/EmptyState";
import { useAuth } from "./lib/api";

const THEME_KEY = "loopgain-dashboard-theme";
const DENSITY_KEY = "loopgain-dashboard-density";
const COST_KEY = "loopgain-dashboard-cost-per-iter";

type Theme = "dark" | "light";
type Density = "comfortable" | "compact";

function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "dark";
}
function loadDensity(): Density {
  const v = localStorage.getItem(DENSITY_KEY);
  return v === "comfortable" || v === "compact" ? v : "compact";
}
function loadCost(): number {
  const v = Number(localStorage.getItem(COST_KEY));
  return Number.isFinite(v) && v > 0 ? v : 0.05;
}

export function App() {
  const auth = useAuthProvider();
  const filters = useFiltersProvider();
  return (
    <AuthContext.Provider value={auth}>
      <FilterContext.Provider value={filters}>
        <AppInner />
      </FilterContext.Provider>
    </AuthContext.Provider>
  );
}

function AppInner() {
  const { config, demo, connection, disconnect } = useAuth();
  const isAuthed = Boolean(config) || demo;

  const [route, setRoute] = useState<RouteId>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [density, setDensity] = useState<Density>(() => loadDensity());
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [costPerIter, setCostPerIterState] = useState(() => loadCost());

  function setCostPerIter(n: number): void {
    setCostPerIterState(n);
    localStorage.setItem(COST_KEY, String(n));
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem(DENSITY_KEY, density);
  }, [density]);

  // Open the connect dialog automatically if we land with no config & not in demo.
  useEffect(() => {
    if (!isAuthed) setConnectOpen(true);
  }, [isAuthed]);

  const pollMs = timeRange === "live" ? 15_000 : undefined;
  const sinceHours = timeRangeHours(timeRange) ?? undefined;

  // ── Workloads for palette ───────────────────────────────────────────
  const stats = useStats({ pollMs });
  const workloads =
    stats.state.status === "ok"
      ? stats.state.data.workloads
      : stats.state.status === "loading" && stats.state.previous
      ? stats.state.previous.workloads
      : [];

  // ── Keybindings ────────────────────────────────────────────────────
  useEffect(() => {
    let prefix: "g" | null = null;
    let timer: number | null = null;

    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement | null)?.tagName?.toUpperCase() ?? "";
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (inField) return;
      if (prefix === "g") {
        const map: Record<string, RouteId> = {
          o: "overview",
          h: "health-map",
          c: "convergence",
          w: "waste",
          m: "gain-margin",
          r: "rollbacks",
          e: "eta",
          a: "alerts",
          s: "settings",
        };
        const target = map[e.key];
        if (target) {
          setRoute(target);
          prefix = null;
          if (timer) window.clearTimeout(timer);
        }
        return;
      }
      if (e.key === "g") {
        prefix = "g";
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          prefix = null;
        }, 1200);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Route content ──────────────────────────────────────────────────
  const content = useMemo(() => {
    if (!isAuthed) {
      return <EmptyState openConnect={() => setConnectOpen(true)} />;
    }
    if (isLoopRoute(route)) {
      const workloadId = loopFromRoute(route);
      if (workloadId) return <LoopDetail workloadId={workloadId} setRoute={setRoute} />;
    }
    switch (route) {
      case "overview":
        return (
          <Overview
            setRoute={setRoute}
            costPerIter={costPerIter}
            pollMs={pollMs}
            sinceHours={sinceHours}
            timeRange={timeRange}
          />
        );
      case "health-map":
        return <HealthMap setRoute={setRoute} pollMs={pollMs} sinceHours={sinceHours} />;
      case "convergence":
        return <Convergence pollMs={pollMs} sinceHours={sinceHours} />;
      case "waste":
        return (
          <Waste
            costPerIter={costPerIter}
            setCostPerIter={setCostPerIter}
            pollMs={pollMs}
            sinceHours={sinceHours}
          />
        );
      case "gain-margin":
        return <GainMargin pollMs={pollMs} sinceHours={sinceHours} />;
      case "rollbacks":
        return <Rollbacks pollMs={pollMs} sinceHours={sinceHours} />;
      case "eta":
        return <ETAAccuracy />;
      case "alerts":
        return <Alerts setRoute={setRoute} />;
      case "settings":
        return <Settings costPerIter={costPerIter} setCostPerIter={setCostPerIter} />;
      case "empty":
        return <EmptyState openConnect={() => setConnectOpen(true)} />;
      default:
        return (
          <Overview
            setRoute={setRoute}
            costPerIter={costPerIter}
            pollMs={pollMs}
            sinceHours={sinceHours}
            timeRange={timeRange}
          />
        );
    }
  }, [isAuthed, route, costPerIter, pollMs, sinceHours, timeRange]);

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-0)" }}>
      <Sidebar route={route} setRoute={setRoute} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          theme={theme}
          setTheme={setTheme}
          density={density}
          setDensity={setDensity}
          openPalette={() => setPaletteOpen(true)}
          openConnect={() => setConnectOpen(true)}
        />
        {isAuthed && route !== "settings" && route !== "empty" && <FilterBar />}
        <main style={{ flex: 1, overflow: "auto" }}>{content}</main>
        <footer
          className="app-footer"
          style={{
            height: 26,
            borderTop: "1px solid var(--border)",
            background: "var(--bg-1)",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: 16,
            fontSize: 11,
            color: "var(--text-3)",
            flex: "0 0 auto",
          }}
        >
          <span className="mono">v0.3.0</span>
          <span>·</span>
          <span>
            ingestion{" "}
            <span
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
              ● {demo ? "demo" : connection.status}
            </span>
          </span>
          {connection.status === "connected" && "customerId" in connection && connection.customerId && (
            <span>
              · cust <span className="mono">{connection.customerId.slice(0, 12)}</span>
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span>
            <span className="kbd">g</span> <span className="kbd">h</span> health ·{" "}
            <span className="kbd">⌘</span>
            <span className="kbd">K</span> palette
          </span>
        </footer>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        setRoute={setRoute}
        workloads={workloads}
        toggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        disconnect={disconnect}
      />
      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />

      {/* Show nav keybinding hint badges (no-op, just to ensure NAV stays imported) */}
      <span style={{ display: "none" }} aria-hidden>
        {NAV.length}
      </span>
    </div>
  );
}
