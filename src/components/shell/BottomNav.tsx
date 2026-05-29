// Bottom-nav for mobile (≤ 600px). Replaces the left Sidebar at narrow
// widths so the dashboard's prime real estate goes to the content panels,
// not chrome. Same nav items as Sidebar; icons + tiny labels in the
// iOS/Android tab-bar convention. Horizontally scrollable if more items
// than fit (the dashboard has 8 nav items + an optional Settings entry
// for authed customers — at 375px that's tight, so swipe-reveal is fine).

import { Icon } from "../primitives";
import { NAV, type RouteId } from "./routes";

interface Props {
  route: RouteId;
  setRoute: (r: RouteId) => void;
  /** Bench/demo mode hides the Settings nav item (no mutation paths
   *  on the public surfaces). */
  bench?: boolean;
  demo?: boolean;
}

export function BottomNav({ route, setRoute, bench, demo }: Props) {
  const showSettings = !bench && !demo;

  return (
    <nav
      className="app-bottom-nav"
      role="navigation"
      aria-label="Primary"
    >
      <div className="app-bottom-nav-scroll">
        {NAV.map((item) => {
          const IconComp = Icon[item.icon];
          const active = route === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setRoute(item.id)}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className="app-bottom-nav-item"
              style={{
                color: active ? "var(--text-1)" : "var(--text-3)",
                background: active ? "var(--surf-2)" : "transparent",
              }}
            >
              <IconComp />
              <span className="app-bottom-nav-label">{item.label}</span>
            </button>
          );
        })}
        {showSettings && (
          <button
            type="button"
            onClick={() => setRoute("settings")}
            aria-current={route === "settings" ? "page" : undefined}
            title="Settings"
            className="app-bottom-nav-item"
            style={{
              color: route === "settings" ? "var(--text-1)" : "var(--text-3)",
              background: route === "settings" ? "var(--surf-2)" : "transparent",
            }}
          >
            <Icon.Settings />
            <span className="app-bottom-nav-label">Settings</span>
          </button>
        )}
      </div>
    </nav>
  );
}
