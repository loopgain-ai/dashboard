import { Icon } from "../primitives";
import { NAV, type RouteId } from "./routes";

interface Props {
  route: RouteId;
  setRoute: (r: RouteId) => void;
  collapsed: boolean;
  setCollapsed: (fn: (c: boolean) => boolean) => void;
}

export function Sidebar({ route, setRoute, collapsed, setCollapsed }: Props) {
  return (
    <aside
      className="app-sidebar"
      style={{
        width: collapsed ? 56 : 220,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-1)",
        display: "flex",
        flexDirection: "column",
        transition: "width 180ms ease",
        flex: "0 0 auto",
      }}
    >
      <div
        className="app-brand"
        style={{
          height: 52,
          padding: collapsed ? "0" : "0 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {collapsed ? (
          <>
            <img
              src="/loopgain-mark-dark.svg"
              alt="LoopGain"
              className="brand-dark"
              width={39}
              height={39}
              style={{}}
            />
            <img
              src="/loopgain-mark-light.svg"
              alt="LoopGain"
              className="brand-light"
              width={39}
              height={39}
              style={{}}
            />
          </>
        ) : (
          <>
            <img
              src="/loopgain-lockup-dark.png"
              alt="LoopGain"
              className="brand-dark"
              style={{ height: 24, width: "auto" }}
            />
            <img
              src="/loopgain-lockup-light.png"
              alt="LoopGain"
              className="brand-light"
              style={{ height: 24, width: "auto" }}
            />
          </>
        )}
      </div>

      <nav
        style={{
          padding: "10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          flex: 1,
        }}
      >
        {NAV.map((item) => {
          const IconComp = Icon[item.icon];
          const active = route === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setRoute(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: collapsed ? "0" : "0 10px",
                height: 30,
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 5,
                color: active ? "var(--text-1)" : "var(--text-2)",
                background: active ? "var(--surf-2)" : "transparent",
                fontSize: 12.5,
                fontWeight: active ? 500 : 400,
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = "var(--surf-1)";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              {active && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 5,
                    bottom: 5,
                    width: 2,
                    background: "var(--accent)",
                    borderRadius: 2,
                  }}
                />
              )}
              <IconComp />
              {!collapsed && <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>}
              {!collapsed && (
                <span className="kbd" style={{ opacity: active ? 1 : 0.5 }}>
                  {item.kbd}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ borderTop: "1px solid var(--border)", padding: 8 }}>
        <button
          type="button"
          onClick={() => setRoute("settings")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: collapsed ? "0" : "0 10px",
            height: 30,
            width: "100%",
            justifyContent: collapsed ? "center" : "flex-start",
            borderRadius: 5,
            color: route === "settings" ? "var(--text-1)" : "var(--text-2)",
            background: route === "settings" ? "var(--surf-2)" : "transparent",
            fontSize: 12.5,
          }}
        >
          <Icon.Settings />
          {!collapsed && <span>Settings</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: collapsed ? "0" : "0 10px",
            height: 30,
            width: "100%",
            justifyContent: collapsed ? "center" : "flex-start",
            borderRadius: 5,
            color: "var(--text-3)",
            fontSize: 12.5,
            transform: collapsed ? "scaleX(-1)" : "none",
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon.Chevron />
        </button>
      </div>
    </aside>
  );
}
