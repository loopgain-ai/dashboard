import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { loadConfig } from "./lib/api";
import "./styles/index.css";

// Public landing rule (2026-05-28): a visitor with no stored customer
// config lands on /demo (the canonical public surface — parameterized
// projection) unless they specifically requested /benchmark. This
// catches both the root path "/" and any other deep link the visitor
// might hit without a config (e.g. /empty, /settings, bookmarks).
// Customers with a configured endpoint still land on / and see their
// own tenant.
if (typeof window !== "undefined") {
  const p = window.location.pathname;
  const isPublicRoute = p.startsWith("/demo") || p.startsWith("/benchmark");
  if (!isPublicRoute && !loadConfig()) {
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
