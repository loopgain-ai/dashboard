import { Icon } from "../primitives";
import { useAuth } from "../../lib/api";

export type TimeRange = "live" | "1h" | "24h" | "7d" | "30d";

export const TIME_RANGES: ReadonlyArray<TimeRange> = ["live", "1h", "24h", "7d", "30d"];

export function timeRangeHours(r: TimeRange): number | null {
  switch (r) {
    case "live": return 1;
    case "1h": return 1;
    case "24h": return 24;
    case "7d": return 24 * 7;
    case "30d": return null; // null = use receiver default (30d)
  }
}

interface Props {
  timeRange: TimeRange;
  setTimeRange: (r: TimeRange) => void;
  theme: "dark" | "light";
  setTheme: (fn: (t: "dark" | "light") => "dark" | "light") => void;
  density: "comfortable" | "compact";
  setDensity: (d: "comfortable" | "compact") => void;
  openPalette: () => void;
  openConnect: () => void;
  /** Bench-mode disables the connect button + disconnect button (no
   *  mutation paths reachable from this view). */
  bench?: boolean;
}

export function TopBar({
  timeRange,
  setTimeRange,
  theme,
  setTheme,
  density,
  setDensity,
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

      <div
        className="top-range-wrap"
        style={{
          display: "flex",
          alignItems: "center",
          border: "1px solid var(--border)",
          borderRadius: 5,
          overflow: "hidden",
          background: "var(--surf-1)",
        }}
      >
        {TIME_RANGES.map((r, i) => (
          <button
            key={r}
            type="button"
            className="top-range-pill"
            onClick={() => setTimeRange(r)}
            style={{
              height: 26,
              padding: "0 10px",
              fontSize: 11.5,
              color: timeRange === r ? "var(--text-1)" : "var(--text-3)",
              background: timeRange === r ? "var(--surf-3)" : "transparent",
              borderLeft: i === 0 ? "none" : "1px solid var(--border)",
              fontFamily: "var(--mono)",
            }}
            title={r === "live" ? "Auto-refresh every 15s" : `Last ${r}`}
          >
            {r === "live" ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span
                  className={timeRange === "live" ? "pulse-dot" : ""}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: timeRange === "live" ? "var(--band-fast)" : "var(--text-3)",
                  }}
                />
                LIVE
              </span>
            ) : (
              r
            )}
          </button>
        ))}
      </div>

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

      <div
        className="top-density-wrap"
        style={{
          display: "flex",
          border: "1px solid var(--border)",
          borderRadius: 5,
          overflow: "hidden",
        }}
      >
        {[
          { id: "comfortable" as const, label: "cozy" },
          { id: "compact" as const, label: "dense" },
        ].map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDensity(d.id)}
            style={{
              height: 26,
              padding: "0 10px",
              fontSize: 11,
              color: density === d.id ? "var(--text-1)" : "var(--text-3)",
              background: density === d.id ? "var(--surf-3)" : "transparent",
              fontFamily: "var(--mono)",
            }}
            title={d.id}
          >
            {d.label}
          </button>
        ))}
      </div>

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
