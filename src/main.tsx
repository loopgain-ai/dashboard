import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { loadConfig } from "./lib/api";
import "./styles/index.css";

// Public landing rule (2026-05-28): a visitor with no stored customer
// config lands on /demo (the canonical public surface — a live replay of
// the recorded benchmark run) unless they specifically requested /benchmark. This
// catches both the root path "/" and any other deep link the visitor
// might hit without a config (e.g. /empty, /settings, bookmarks).
// Customers with a configured endpoint still land on / and see their
// own tenant.
if (typeof window !== "undefined") {
  const p = window.location.pathname;
  const isPublicRoute =
    p.startsWith("/demo") ||
    p.startsWith("/benchmark") ||
    // Account pages — the front door for every "get a token" CTA.
    p.startsWith("/signup") ||
    p.startsWith("/login");
  // ?connect=1 is the "Exit demo → connect your own tenant" path: the
  // visitor deliberately left /demo for the onboarding screen, so don't
  // bounce them straight back (App auto-opens the ConnectDialog).
  const wantsConnect = new URLSearchParams(window.location.search).has("connect");
  if (!isPublicRoute && !wantsConnect && !loadConfig()) {
    window.location.replace("/demo");
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
