// App root: routing, theme/density, ⌘K palette, g-prefix keybindings,
// live-mode polling cadence, and the auth gate that swaps in EmptyState
// when no endpoint is configured.

import { useEffect, useMemo, useState } from "react";
// The dashboard app's OWN version (this SaaS frontend), kept separate from the
// loopgain library version. Single-sourced from this repo's package.json.
import { version as APP_VERSION } from "../package.json";
import { AuthContext, useAuthProvider } from "./lib/api";
import { FilterContext, useFiltersProvider } from "./lib/filters";
import { DemoReplayContext, useDemoReplayProvider } from "./lib/demo-replay";
import { useStats } from "./lib/data-hooks";
import { ConnectDialog } from "./components/auth/ConnectDialog";
import { LoginPage, SignupPage } from "./components/auth/AccountPages";
import { MethodologyModal } from "./components/auth/MethodologyModal";
import {
  BottomNav,
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
import { Rollbacks } from "./components/panels/Rollbacks";
import { LoopDetail } from "./components/panels/LoopDetail";
import { Alerts } from "./components/panels/Alerts";
import { Settings } from "./components/panels/Settings";
import { EmptyState } from "./components/panels/EmptyState";
import { useAuth } from "./lib/api";

const THEME_KEY = "loopgain-dashboard-theme";
const COST_KEY = "loopgain-dashboard-cost-per-iter";
const INCLUDE_CALIBRATION_KEY = "loopgain-dashboard-include-calibration";
const BENCH_BANNER_DISMISSED_KEY = "loopgain-bench-banner-dismissed";
const DEMO_BANNER_DISMISSED_KEY = "loopgain-demo-banner-dismissed";

// Live-refresh interval. Each tick is one cheap GET to the receiver and is
// gated on tab visibility (see useApi), so an idle/backgrounded tab is free.
const LIVE_POLL_MS = 10_000;

type Theme = "dark" | "light";

function loadTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "dark";
}
function loadCost(): number {
  const v = Number(localStorage.getItem(COST_KEY));
  return Number.isFinite(v) && v > 0 ? v : 0.08;
}
// Default false, matching the receiver's own safe default (calibration
// rows — deliberate runs that ignore their own real stop signal to
// measure a counterfactual — stay out of the aggregates unless asked for).
function loadIncludeCalibration(): boolean {
  return localStorage.getItem(INCLUDE_CALIBRATION_KEY) === "true";
}

export function App() {
  // Account pages render standalone — no dashboard shell, no data
  // providers. Decided once from the URL, like /demo and /benchmark.
  if (typeof window !== "undefined") {
    const p = window.location.pathname;
    if (p.startsWith("/signup")) return <SignupPage />;
    if (p.startsWith("/login")) return <LoginPage />;
  }
  return <AppProviders />;
}

function AppProviders() {
  const auth = useAuthProvider();
  const filters = useFiltersProvider();
  return (
    <AuthContext.Provider value={auth}>
      <FilterContext.Provider value={filters}>
        <DemoReplayHost />
      </FilterContext.Provider>
    </AuthContext.Provider>
  );
}

/** Separate host so useDemoReplayProvider can read AuthContext (demo flag)
 *  from the providers above it. Replay is a no-op outside demo mode. */
function DemoReplayHost() {
  const replay = useDemoReplayProvider();
  return (
    <DemoReplayContext.Provider value={replay}>
      <AppInner />
    </DemoReplayContext.Provider>
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
  // timeRange is pinned to "30d" — see TopBar.tsx note on why the
  // selector was removed. Kept as a constant so panel prop signatures
  // don't change.
  const timeRange: TimeRange = "30d";
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [costPerIter, setCostPerIterState] = useState(() => loadCost());
  const [includeCalibration, setIncludeCalibrationState] = useState(
    () => loadIncludeCalibration(),
  );

  function setCostPerIter(n: number): void {
    setCostPerIterState(n);
    localStorage.setItem(COST_KEY, String(n));
  }

  function setIncludeCalibration(v: boolean): void {
    setIncludeCalibrationState(v);
    localStorage.setItem(INCLUDE_CALIBRATION_KEY, String(v));
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Open the connect dialog automatically if we land with no config & not in
  // demo/bench. Bench-mode is read-only and never prompts for a token.
  useEffect(() => {
    if (!isAuthed && !bench) setConnectOpen(true);
  }, [isAuthed, bench]);

  // In bench mode, "settings" is inaccessible (no tenant config to
  // manage). The "empty" route IS reachable in bench mode now — it's
  // the install-instructions surface that the BenchBanner's CTA
  // routes to. If a stale settings route survives via hot-reload,
  // redirect to overview.
  useEffect(() => {
    if (bench && route === "settings") {
      setRoute("overview");
    }
  }, [bench, route]);

  // Live polling. The time-range selector that used to drive this is gone, so
  // we poll at a fixed interval; useApi gates each tick on tab visibility, so a
  // backgrounded tab costs nothing. sinceHours stays derived from timeRange.
  const pollMs = LIVE_POLL_MS;
  const sinceHours = timeRangeHours(timeRange) ?? undefined;

  // Demo mode never uses a manual $/iter — the recorded bench run carries
  // measured per-run dollars, so the extrapolation fallback that consumes
  // costPerIter is unreachable there. Authed tenants keep their setting.
  const effectiveCostPerIter = costPerIter;

  // ── Workloads for palette (unfiltered: it's a jump list, not a view) ──
  const stats = useStats({ pollMs, includeCalibration, unfiltered: true });
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
          r: "rollbacks",
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
            costPerIter={effectiveCostPerIter}
            includeCalibration={includeCalibration}
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
            costPerIter={effectiveCostPerIter}
            setCostPerIter={setCostPerIter}
            includeCalibration={includeCalibration}
            pollMs={pollMs}
            sinceHours={sinceHours}
          />
        );
      case "rollbacks":
        return <Rollbacks pollMs={pollMs} sinceHours={sinceHours} />;
      case "alerts":
        return <Alerts setRoute={setRoute} />;
      case "settings":
        return (
          <Settings
            costPerIter={costPerIter}
            setCostPerIter={setCostPerIter}
            includeCalibration={includeCalibration}
            setIncludeCalibration={setIncludeCalibration}
          />
        );
      case "empty":
        return <EmptyState openConnect={() => setConnectOpen(true)} />;
      default:
        return (
          <Overview
            setRoute={setRoute}
            costPerIter={effectiveCostPerIter}
            includeCalibration={includeCalibration}
            pollMs={pollMs}
            sinceHours={sinceHours}
            timeRange={timeRange}
          />
        );
    }
  }, [isAuthed, route, costPerIter, effectiveCostPerIter, includeCalibration, pollMs, sinceHours, timeRange]);

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
          <DemoBanner onOpenMethodology={() => setMethodologyOpen(true)} />
        )}
        <TopBar
          theme={theme}
          setTheme={setTheme}
          openPalette={() => setPaletteOpen(true)}
          openConnect={() => setConnectOpen(true)}
          bench={bench}
        />
        {isAuthed && route !== "settings" && route !== "empty" && <FilterBar />}
        <main style={{ flex: 1, overflow: "auto" }}>{content}</main>
        <footer
          className="app-footer"
          style={{
            minHeight: 26,
            borderTop: "1px solid var(--border)",
            background: "var(--bg-1)",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            gap: 16,
            fontSize: 11,
            color: "var(--text-3)",
            flex: "0 0 auto",
            flexWrap: "wrap",
          }}
        >
          {/* The DASHBOARD's own version (this app), sourced from its
              package.json — NOT the loopgain library version. Keep these
              decoupled: the dashboard and the library version independently. */}
          <span className="mono footer-secondary">v{APP_VERSION}</span>
          <span className="footer-secondary">·</span>
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
              ● {bench ? "bench" : demo ? "demo · recorded replay" : connection.status}
            </span>
          </span>
          {connection.status === "connected" && "customerId" in connection && connection.customerId && (
            <span>
              · cust <span className="mono">{connection.customerId.slice(0, 12)}</span>
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span className="footer-secondary">
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
        {isAuthed && <BottomNav route={route} setRoute={setRoute} bench={bench} demo={demo} />}
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

/** Demo banner — explicit "you're watching a replay of the recorded
 *  benchmark run" disclosure. The ⓘ link opens the methodology modal;
 *  the /benchmark link sends visitors to the same tenant's static
 *  full-run view; the sign-up CTA goes straight to /signup — one front
 *  door for every get-a-token path (account → verify → token minted →
 *  login auto-configures). */
function DemoBanner({
  onOpenMethodology,
}: {
  onOpenMethodology: () => void;
}) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEMO_BANNER_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  function dismiss(): void {
    try {
      localStorage.setItem(DEMO_BANNER_DISMISSED_KEY, "1");
    } catch {
      /* noop */
    }
    setDismissed(true);
  }
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
        <strong style={{ fontWeight: 600 }}>Live replay of the recorded benchmark run</strong>{" "}
        <span className="demo-banner-long" style={{ color: "var(--text-2)" }}>
          — you&apos;re watching the bench tenant&apos;s own dashboard,
          picked up 1,000 runs before the end of its 2,000-run recorded
          benchmark (paired Haiku-4.5 runs across 5 workload classes and
          7 framework categories, fully measured). Runs land about once a
          second in their true recorded order; every number is a
          measurement — recorded telemetry, not live inference, nothing
          scaled. The demo includes every Team-tier feature (Waste
          Report, alerts). The finished run is at{" "}
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
        <a
          href="/signup"
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
          Sign up free → instrument your own loops
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss banner"
          title="Dismiss"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 4,
            background: "transparent",
            color: "var(--text-3)",
            border: "1px solid var(--border)",
            fontSize: 14,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Sticky banner shown across the top of every panel in bench mode. Names
 *  what the viewer is looking at + funnels to sign-up. Dismissible — the
 *  ✕ button persists to localStorage so a returning visitor isn't nagged.
 *  Sits above TopBar so it's the first thing on the page. */
function BenchBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BENCH_BANNER_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  function dismiss(): void {
    try {
      localStorage.setItem(BENCH_BANNER_DISMISSED_KEY, "1");
    } catch {
      /* noop */
    }
    setDismissed(true);
  }
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
          . Read-only — click env:bench to connect your own tenant, or see <a href="/demo" style={{ color: "var(--accent)", textDecoration: "underline" }}>/demo</a> to watch this run replay live.
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
        <a
          href="/signup"
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
          Sign up free → instrument your own loops
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss banner"
          title="Dismiss"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 4,
            background: "transparent",
            color: "var(--text-3)",
            border: "1px solid var(--border)",
            fontSize: 14,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
