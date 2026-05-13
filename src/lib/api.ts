// Typed API client + auth context for the LoopGain telemetry receiver.
//
// Auth is paste-an-endpoint-and-token: config persists to localStorage,
// every fetch attaches `Authorization: Bearer <token>`. The receiver is
// CORS-enabled (`Access-Control-Allow-Origin: *`) so calls go direct
// from the browser to the customer's worker.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CalibrationResponse,
  Config,
  EventsResponse,
  HealthResponse,
  ProfilesResponse,
  RotateTokenResponse,
  StatsResponse,
} from "../types";

const STORAGE_KEY = "loopgain-dashboard-config";
const DEMO_KEY = "loopgain-dashboard-demo";

export function loadConfig(): Config | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Config) : null;
  } catch {
    return null;
  }
}

export function saveConfig(c: Config): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadDemoFlag(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoFlag(on: boolean): void {
  if (on) localStorage.setItem(DEMO_KEY, "1");
  else localStorage.removeItem(DEMO_KEY);
}

export class ApiError extends Error {
  public readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function buildUrl(endpoint: string, path: string, params?: Record<string, string | number | undefined>): string {
  const base = endpoint.replace(/\/$/, "");
  const u = new URL(base + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function apiGet<T>(
  endpoint: string,
  token: string,
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const resp = await fetch(buildUrl(endpoint, path, params), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!resp.ok) {
    let body = "";
    try {
      body = await resp.text();
    } catch {
      /* noop */
    }
    throw new ApiError(resp.status, `HTTP ${resp.status} on ${path}${body ? `: ${body}` : ""}`);
  }
  return (await resp.json()) as T;
}

// ── Typed endpoint wrappers ───────────────────────────────────────────

export function getHealth(endpoint: string, signal?: AbortSignal): Promise<HealthResponse> {
  return fetch(buildUrl(endpoint, "/health"), { signal })
    .then((r) => {
      if (!r.ok) throw new ApiError(r.status, "health check failed");
      return r.json() as Promise<HealthResponse>;
    });
}

export function getStats(c: Config, signal?: AbortSignal): Promise<StatsResponse> {
  return apiGet<StatsResponse>(c.endpoint, c.token, "/v1/stats", undefined, signal);
}

export function getProfiles(
  c: Config,
  opts: { workloadId?: string; sinceHours?: number } = {},
  signal?: AbortSignal,
): Promise<ProfilesResponse> {
  return apiGet<ProfilesResponse>(
    c.endpoint,
    c.token,
    "/v1/profiles",
    { workload_id: opts.workloadId, since_hours: opts.sinceHours },
    signal,
  );
}

export function getEvents(
  c: Config,
  opts: { rollbacksOnly?: boolean } = {},
  signal?: AbortSignal,
): Promise<EventsResponse> {
  return apiGet<EventsResponse>(
    c.endpoint,
    c.token,
    "/v1/events",
    opts.rollbacksOnly ? { rollbacks_only: "true" } : undefined,
    signal,
  );
}

export function getCalibration(
  c: Config,
  opts: { workloadId?: string; sinceHours?: number } = {},
  signal?: AbortSignal,
): Promise<CalibrationResponse> {
  return apiGet<CalibrationResponse>(
    c.endpoint,
    c.token,
    "/v1/calibration",
    { workload_id: opts.workloadId, since_hours: opts.sinceHours },
    signal,
  );
}

export async function rotateToken(c: Config): Promise<RotateTokenResponse> {
  const url = buildUrl(c.endpoint, "/v1/token/rotate");
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}` },
  });
  if (!resp.ok) {
    let body = "";
    try {
      body = await resp.text();
    } catch {
      /* noop */
    }
    throw new ApiError(
      resp.status,
      `HTTP ${resp.status} on /v1/token/rotate${body ? `: ${body}` : ""}`,
    );
  }
  return (await resp.json()) as RotateTokenResponse;
}

// ── Auth context ──────────────────────────────────────────────────────

export type ConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; customerId: string | null }
  | { status: "error"; message: string };

export interface AuthCtx {
  config: Config | null;
  demo: boolean;
  setDemo: (on: boolean) => void;
  connection: ConnectionState;
  connect: (c: Config) => Promise<void>;
  disconnect: () => void;
  ping: () => void;
  /**
   * Rotate the current bearer token. On success: returns the new plain token
   * (shown ONCE to the user) and atomically updates the saved config so all
   * subsequent requests use it. Throws on failure; the existing token stays
   * active in that case.
   */
  rotate: () => Promise<RotateTokenResponse>;
}

export const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// ── Generic data hook ─────────────────────────────────────────────────

export type LoadState<T> =
  | { status: "idle" }
  | { status: "loading"; previous?: T }
  | { status: "ok"; data: T; loadedAt: number }
  | { status: "error"; error: Error; previous?: T };

/**
 * Fetch a value tied to the auth context + a key. Re-fetches when key changes,
 * when `refreshTrigger` increments, or when `pollMs` elapses.
 *
 * Returns `idle` if not configured (and not in demo mode); callers can render
 * the empty state in that case.
 */
export function useApi<T>(
  loader: ((config: Config, signal: AbortSignal) => Promise<T>) | null,
  deps: ReadonlyArray<unknown>,
  opts: { pollMs?: number; refreshTrigger?: number } = {},
): { state: LoadState<T>; refresh: () => void } {
  const { config, demo } = useAuth();
  const [state, setState] = useState<LoadState<T>>({ status: "idle" });
  const [tick, setTick] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!loader) {
      setState({ status: "idle" });
      return;
    }
    if (!config || demo) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setState((s) =>
      s.status === "ok"
        ? { status: "loading", previous: s.data }
        : { status: "loading" },
    );
    loader(config, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setState({ status: "ok", data, loadedAt: Date.now() });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setState((s) =>
          s.status === "ok" || s.status === "loading"
            ? {
                status: "error",
                error: e,
                previous: s.status === "ok" ? s.data : s.previous,
              }
            : { status: "error", error: e },
        );
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.endpoint, config?.token, demo, tick, opts.refreshTrigger, ...deps]);

  useEffect(() => {
    if (!opts.pollMs) return;
    const id = window.setInterval(refresh, opts.pollMs);
    return () => window.clearInterval(id);
  }, [opts.pollMs, refresh]);

  return { state, refresh };
}

/** Build a `useApi` loader from one of the endpoint wrappers. */
export function asLoader<T>(fn: (c: Config, signal?: AbortSignal) => Promise<T>) {
  return (c: Config, signal: AbortSignal) => fn(c, signal);
}

export function useAuthProvider(): AuthCtx {
  const [config, setConfig] = useState<Config | null>(() => loadConfig());
  const [demo, setDemoState] = useState<boolean>(() => loadDemoFlag());
  const [connection, setConnection] = useState<ConnectionState>(() =>
    loadConfig() ? { status: "connected", customerId: null } : { status: "disconnected" },
  );

  const connect = useCallback(async (c: Config) => {
    setConnection({ status: "connecting" });
    try {
      await getHealth(c.endpoint);
      const stats = await getStats(c);
      saveConfig(c);
      setConfig(c);
      setConnection({ status: "connected", customerId: stats.customer_id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setConnection({ status: "error", message: msg });
      throw err;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearConfig();
    setConfig(null);
    setConnection({ status: "disconnected" });
  }, []);

  const ping = useCallback(() => {
    if (!config) return;
    getStats(config)
      .then((s) => setConnection({ status: "connected", customerId: s.customer_id }))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setConnection({ status: "error", message: msg });
      });
  }, [config]);

  const rotate = useCallback(async (): Promise<RotateTokenResponse> => {
    if (!config) throw new Error("not connected");
    const resp = await rotateToken(config);
    // Persist the new token immediately. The server already invalidated the
    // old hash; if we don't save here, the user is locked out.
    const next: Config = { endpoint: config.endpoint, token: resp.token };
    saveConfig(next);
    setConfig(next);
    setConnection({ status: "connected", customerId: resp.customer_id });
    return resp;
  }, [config]);

  const setDemo = useCallback((on: boolean) => {
    setDemoFlag(on);
    setDemoState(on);
  }, []);

  return useMemo(
    () => ({ config, demo, setDemo, connection, connect, disconnect, ping, rotate }),
    [config, demo, setDemo, connection, connect, disconnect, ping, rotate],
  );
}
