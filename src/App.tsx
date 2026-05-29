// App root: routing, theme/density, ⌘K palette, g-prefix keybindings,
// live-mode polling cadence, and the auth gate that swaps in EmptyState
// when no endpoint is configured.

import { useEffect, useMemo, useState } from "react";
import { AuthContext, useAuthProvider } from "./lib/api";
import { FilterContext, useFiltersProvider } from "./lib/filters";
import { DemoParamsContext, useDemoParamsProvider } from "./lib/demo-params";
import { useStats } from "./lib/data-hooks";
import { ConnectDialog } from "./components/auth/ConnectDialog";
import { MethodologyModal } from "./components/auth/MethodologyModal";
import { DemoControls } from "./components/panels/DemoControls";
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
  return Number.isFinite(v) && v > 0 ? v : 0.08;
}

export function App() {
  const auth = useAuthProvider();
  const filters = useFiltersProvider();
  const demoParams = useDemoParamsProvider();
  return (
    <AuthContext.Provider value={auth}>
      <FilterContext.Provider value={filters}>
        <DemoParamsContext.Provider value={demoParams}>
          <AppInner />
        </DemoParamsContext.Provider>
      </FilterContext.Provider>
    </AuthContext.Provider>
  );
}

function AppInner() {
  const { config, demo, bench, connection, disconnect } = useAuth();
  // Bench mode counts as authed for the panel-vs-EmptyState branch — the
  // public endpoints are doing the auth-equivalent server-side.
  const isAuthed = Boolean(config) || demo || bench;

  const [route, setRoute] = useState<RouteId>("overview");
  // Default the sidebar to collapsed on narrow viewports so the content
  // pane has room. Decided once at mount — user can still expand manually.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 720,
  );
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [density, setDensity] = useState<Density>(() => loadDensity());
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
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

  // Open the connect dialog automatically if we land with no config & not in
  // demo/bench. Bench-mode is read-only and never prompts for a token.
  useEffect(() => {
    if (!isAuthed && !bench) setConnectOpen(true);
  }, [isAuthed, bench]);

  // In bench mode, "settings" and "empty" routes are inaccessible. If a
  // route state survives via hot-reload, redirect to overview.
  useEffect(() => {
    if (bench && (route === "settings" || route === "empty")) {
      setRoute("overview");
    }
  }, [bench, route]);

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
          // Settings is hidden in bench mode; the keybinding is gated below.
          s: "settings",
        };
        const target = map[e.key];
        if (target === "settings" && bench) {
          prefix = null;
          if (timer) window.clearTimeout(timer);
          return;
        }
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
  }, [bench]);

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
      <Sidebar
        route={route}
        setRoute={setRoute}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        bench={bench}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {bench && <BenchBanner />}
        {demo && (
          <DemoBanner
            onOpenMethodology={() => setMethodologyOpen(true)}
            onOpenInstall={() => setRoute("empty")}
          />
        )}
        <TopBar
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          theme={theme}
          setTheme={setTheme}
          density={density}
          setDensity={setDensity}
          openPalette={() => setPaletteOpen(true)}
          openConnect={() => setConnectOpen(true)}
          bench={bench}
        />
        {isAuthed && route !== "settings" && route !== "empty" && <FilterBar />}
        {demo && route !== "empty" && (
          <DemoControls onOpenMethodology={() => setMethodologyOpen(true)} />
        )}
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
              ● {bench ? "bench" : demo ? "demo projection" : connection.status}
            </span>
          </span>
          {connection.status === "connected" && "customerId" in connection && connection.customerId && (
            <span>
              · cust <span className="mono">{connection.customerId.slice(0, 12)}</span>
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span>
            <a
              href="https://loopgain.ai/privacy"
              target="_blank"
              rel="noopener"
              style={{ color: "var(--text-3)", textDecoration: "none" }}
            >
              privacy
            </a>{" "}
            ·{" "}
            <a
              href="https://loopgain.ai/terms"
              target="_blank"
              rel="noopener"
              style={{ color: "var(--text-3)", textDecoration: "none" }}
            >
              terms
            </a>{" "}
            ·{" "}
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
      <MethodologyModal
        open={methodologyOpen}
        onClose={() => setMethodologyOpen(false)}
      />

      {/* Show nav keybinding hint badges (no-op, just to ensure NAV stays imported) */}
      <span style={{ display: "none" }} aria-hidden>
        {NAV.length}
      </span>
    </div>
  );
}

/** Demo banner — explicit "you're looking at a projection, here's where
 *  to verify the receipts" disclosure. The ⓘ link opens the methodology
 *  modal; the /benchmark link sends visitors to the underlying bench; the
 *  "Install free" CTA routes to the inline EmptyState (install snippets
 *  for all 6 framework adapters) rather than the marketing site, so the
 *  visitor stays in the dashboard. */
function DemoBanner({
  onOpenMethodology,
  onOpenInstall,
}: {
  onOpenMethodology: () => void;
  onOpenInstall: () => void;
}) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        padding: "10px 16px",
        background: "var(--surf-2)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 16,
        rowGap: 8,
        flexWrap: "wrap",
        fontSize: 12.5,
        color: "var(--text-1)",
      }}
    >
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <strong style={{ fontWeight: 600 }}>Production-scale projection</strong>{" "}
        <span className="demo-banner-long" style={{ color: "var(--text-2)" }}>
          — bench dynamics × your scale &amp; cost assumptions. The
          underlying bench (2,000 paired Haiku-4.5 runs across 5
          workload classes — codegen, debate, planner, RAG, adversarial
          — and 7 framework categories (6 shipped adapters + 1
          bare-SDK control), fully measured) is at{" "}
          <a
            href="/benchmark"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            /benchmark
          </a>
          .{" "}
          <button
            type="button"
            onClick={onOpenMethodology}
            style={{
              background: "transparent",
              color: "var(--accent)",
              textDecoration: "underline",
              fontSize: 12.5,
              padding: 0,
              cursor: "pointer",
            }}
          >
            ⓘ methodology
          </button>
        </span>
        <span className="demo-banner-short" style={{ color: "var(--text-2)" }}>
          {" "}
          —{" "}
          <a
            href="/benchmark"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            /benchmark
          </a>
          {" · "}
          <button
            type="button"
            onClick={onOpenMethodology}
            style={{
              background: "transparent",
              color: "var(--accent)",
              textDecoration: "underline",
              fontSize: 12.5,
              padding: 0,
              cursor: "pointer",
            }}
          >
            ⓘ methodology
          </button>
        </span>
      </div>
      <button
        type="button"
        onClick={onOpenInstall}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 28,
          padding: "0 14px",
          borderRadius: 5,
          background: "var(--accent)",
          color: "var(--bg-0)",
          fontWeight: 500,
          textDecoration: "none",
          whiteSpace: "nowrap",
          fontSize: 12,
          cursor: "pointer",
          border: "none",
        }}
      >
        Install free → instrument your own loops
      </button>
    </div>
  );
}

/** Sticky banner shown across the top of every panel in bench mode. Names
 *  what the viewer is looking at + funnels to sign-up. Sits above TopBar so
 *  it's the first thing on the page. */
function BenchBanner() {
  return (
    <div
      style={{
        flex: "0 0 auto",
        padding: "10px 16px",
        background: "var(--surf-2)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: 16,
        rowGap: 8,
        flexWrap: "wrap",
        fontSize: 12.5,
        color: "var(--text-1)",
      }}
    >
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <strong style={{ fontWeight: 600 }}>
          You&apos;re viewing the LoopGain benchmark tenant
        </strong>{" "}
        <span style={{ color: "var(--text-2)" }}>
          — 2,000 real-API trials from the{" "}
          <a
            href="https://github.com/loopgain-ai/loopgain-bench"
            target="_blank"
            rel="noopener"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            public bench repo
          </a>
          . Read-only — click env:bench to connect your own tenant, or see <a href="/demo" style={{ color: "var(--accent)", textDecoration: "underline" }}>/demo</a> for a production-scale projection.
        </span>
      </div>
      <a
        href="https://loopgain.ai"
        target="_blank"
        rel="noopener"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 28,
          padding: "0 14px",
          borderRadius: 5,
          background: "var(--accent)",
          color: "var(--bg-0)",
          fontWeight: 500,
          textDecoration: "none",
          whiteSpace: "nowrap",
          flex: "0 0 auto",
        }}
      >
        Install free → instrument your own loops
      </a>
    </div>
  );
}
