import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { loadConfig } from "./lib/api";
import "./styles/index.css";

// Public landing rule (2026-05-28): visitors hitting the root path with
// no stored customer config are sent to /demo — the canonical public
// surface is the parameterized projection, with /benchmark one click
// away for visitors who want the underlying receipts. Customers with a
// configured endpoint still land on / and see their own tenant.
if (
  typeof window !== "undefined" &&
  window.location.pathname === "/" &&
  !loadConfig()
) {
  window.location.replace("/demo");
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
