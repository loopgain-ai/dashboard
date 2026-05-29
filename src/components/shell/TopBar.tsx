import { Icon } from "../primitives";
import { useAuth } from "../../lib/api";

// TimeRange + density toggle were removed from TopBar 2026-05-29 (the
// time-range buttons didn't actually drive /stats which is hard-pinned to
// 30d server-side, so changing them appeared broken; the density toggle
// added clutter without serving a buyer goal). The TimeRange type stays
// exported as a constant for callers that still want to pass it through
// to panels — those panels treat any value as a no-op now.
export type TimeRange = "30d";
export const TIME_RANGES: ReadonlyArray<TimeRange> = ["30d"];
export function timeRangeHours(_r: TimeRange): number | null {
  // null = use receiver default (30d). All other TimeRange values are
  // gone; this signature is kept for backward source compatibility with
  // panels that still import + pass it through.
  return null;
}

interface Props {
  theme: "dark" | "light";
  setTheme: (fn: (t: "dark" | "light") => "dark" | "light") => void;
  openPalette: () => void;
  openConnect: () => void;
  /** Bench-mode disables the connect button + disconnect button (no
   *  mutation paths reachable from this view). */
  bench?: boolean;
}

export function TopBar({
  theme,
  setTheme,
  openPalette,
  openConnect,
  bench,
}: Props) {
  const { connection, demo, disconnect } = useAuth();
  const connDot =
    connection.status === "connected"
      ? "var(--band-fast)"
      : connection.status === "connecting"
      ? "var(--band-stall)"
      : connection.status === "error"
      ? "var(--band-osc)"
      : "var(--text-3)";

  return (
    <header
      style={{
        height: 52,
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-1)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 14px",
        flex: "0 0 auto",
      }}
    >
      <button
        type="button"
        onClick={openConnect}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 28,
          padding: "0 10px",
          borderRadius: 5,
          border: "1px solid var(--border)",
          background: "var(--surf-1)",
          fontSize: 12,
        }}
        title={
          bench
            ? "Public benchmark tenant — click to connect your own"
            : demo
            ? "Demo projection — click to connect your own tenant"
            : connection.status === "connected"
            ? "Connected"
            : "Configure endpoint"
        }
      >
        <span
          className={connection.status === "connecting" ? "pulse-dot" : ""}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: bench || demo ? "var(--band-fast)" : connDot,
          }}
        />
        <span className="mono" style={{ color: "var(--text-1)" }}>
          {bench
            ? "env:bench"
            : demo
            ? "env:demo"
            : connection.status === "connected"
            ? "env:live"
            : "env:setup"}
        </span>
        <Icon.ArrowDown />
      </button>

      <button
        type="button"
        onClick={openPalette}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 28,
          padding: "0 10px",
          borderRadius: 5,
          border: "1px solid var(--border)",
          background: "var(--surf-1)",
          fontSize: 11.5,
          color: "var(--text-3)",
          flex: "1 1 200px",
          minWidth: 0,
          maxWidth: 380,
          whiteSpace: "nowrap",
        }}
      >
        <Icon.Search />
        <span
          className="top-search-label"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: "1 1 auto",
            textAlign: "left",
          }}
        >
          Search loops, panels, commands…
        </span>
        <span className="kbd" style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>
          ⌘K
        </span>
      </button>

      <div style={{ flex: 1, minWidth: 0 }} />

      <button
        type="button"
        onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 5,
          border: "1px solid var(--border)",
          background: "var(--surf-1)",
          color: "var(--text-2)",
        }}
        title="Toggle theme"
      >
        {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
      </button>

      {!bench && !demo && connection.status === "connected" && (
        <button
          type="button"
          onClick={disconnect}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 5,
            border: "1px solid var(--border)",
            background: "var(--surf-1)",
            color: "var(--text-2)",
          }}
          title="Disconnect"
        >
          <Icon.LogOut />
        </button>
      )}
    </header>
  );
}
