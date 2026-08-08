import { useEffect, useState } from "react";
import { loadConfig, saveConfig } from "../../lib/api";
import type { Config } from "../../types";

const AUTH_BASE = "https://loopgain.ai/api/auth";
const PENDING_KEY = "loopgain-vesper-connect";

interface PendingVesperConnection {
  callback: string;
  state: string;
}

interface AccountResponse {
  ok: boolean;
  error?: string;
  config?: { endpoint: string; token: string } | null;
}

export function VesperConnectPage() {
  const [error, setError] = useState<string>();

  useEffect(() => {
    void connectVesper().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Vesper could not be connected");
    });
  }, []);

  if (error) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <h1 style={{ marginTop: 0 }}>Vesper could not connect</h1>
          <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>{error}</p>
          <a href="/login?vesper=1" style={{ color: "var(--accent)" }}>Log in and try again</a>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>Connecting Vesper to LoopGain…</h1>
        <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
          Your credential is being verified and stored directly in the local macOS Keychain.
        </p>
      </section>
    </main>
  );
}

export function pendingVesperConnection(): PendingVesperConnection | undefined {
  try {
    const value = sessionStorage.getItem(PENDING_KEY);
    if (!value) return undefined;
    return validatePending(JSON.parse(value));
  } catch {
    return undefined;
  }
}

export function resumePendingVesperConnection(): boolean {
  const pending = pendingVesperConnection();
  if (!pending) return false;
  const url = new URL("/connect/vesper", window.location.origin);
  url.searchParams.set("callback", pending.callback);
  url.searchParams.set("state", pending.state);
  window.location.assign(url.toString());
  return true;
}

async function connectVesper(): Promise<void> {
  const query = new URLSearchParams(window.location.search);
  const supplied = validatePending({ callback: query.get("callback"), state: query.get("state") });
  const pending = supplied ?? pendingVesperConnection();
  if (!pending) throw new Error("The Vesper connection request is invalid or expired. Open Powered by LoopGain from Vesper again.");
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  let config = loadConfig();
  if (!config) config = await configFromAccount();
  if (!config) {
    window.location.replace("/login?vesper=1");
    return;
  }

  saveConfig(config);
  const response = await fetch(pending.callback, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: pending.state, endpoint: config.endpoint, token: config.token }),
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error || `Local Vesper rejected the connection (${response.status})`);
  }
  sessionStorage.removeItem(PENDING_KEY);
  window.location.replace("/");
}

async function configFromAccount(): Promise<Config | null> {
  let session = "";
  try {
    session = localStorage.getItem("loopgain-account-session") || "";
  } catch {
    return null;
  }
  if (!session) return null;
  const response = await fetch(`${AUTH_BASE}/me`, {
    headers: { authorization: `Bearer ${session}` },
    cache: "no-store",
  });
  if (!response.ok) {
    localStorage.removeItem("loopgain-account-session");
    return null;
  }
  const result = await response.json() as AccountResponse;
  return result.ok && result.config
    ? { endpoint: result.config.endpoint, token: result.config.token }
    : null;
}

function validatePending(value: unknown): PendingVesperConnection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as { callback?: unknown; state?: unknown };
  if (typeof candidate.callback !== "string" || typeof candidate.state !== "string") return undefined;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(candidate.state)) return undefined;
  try {
    const callback = new URL(candidate.callback);
    if (callback.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(callback.hostname)) return undefined;
    if (callback.pathname !== "/api/loopgain/connect/callback" || callback.search || callback.hash || callback.username || callback.password) return undefined;
    return { callback: callback.toString(), state: candidate.state };
  } catch {
    return undefined;
  }
}

const pageStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "var(--bg-0)",
} as const;

const cardStyle = {
  width: "min(420px, 100%)",
  padding: 28,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surf-1)",
  color: "var(--text-1)",
} as const;
