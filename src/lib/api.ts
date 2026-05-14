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
  AlertDeliveriesResponse,
  AlertRulePayload,
  AlertRuleResponse,
  AlertRulesResponse,
  CalibrationResponse,
  Config,
  EventDetailResponse,
  EventsResponse,
  FilterSet,
  HealthResponse,
  ProfilesResponse,
  StatsResponse,
} from "../types";

const STORAGE_KEY = "loopgain-dashboard-config";
const DEMO_KEY = "loopgain-dashboard-demo";

export function loadConfig(): Config | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Config;
    // Defense-in-depth: refuse to rehydrate a config that points at a
    // non-https endpoint (a stale config from before the scheme check was
    // added, or a manually-edited localStorage entry). Drop it so the user
    // is re-prompted via ConnectDialog with the up-to-date validation.
    if (parsed && typeof parsed.endpoint === "string") {
      try {
        const u = new URL(parsed.endpoint);
        const isLocalhost =
          u.hostname === "localhost" || u.hostname === "127.0.0.1";
        if (u.protocol !== "https:" && !(u.protocol === "http:" && isLocalhost)) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
    }
    return parsed;
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

async function apiSend<T>(
  endpoint: string,
  token: string,
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const resp = await fetch(buildUrl(endpoint, path), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!resp.ok) {
    let text = "";
    try {
      text = await resp.text();
    } catch {
      /* noop */
    }
    throw new ApiError(resp.status, `HTTP ${resp.status} on ${path}${text ? `: ${text}` : ""}`);
  }
  // DELETE may return a small body; otherwise JSON.
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
  opts: { workloadId?: string; sinceHours?: number } & FilterSet = {},
  signal?: AbortSignal,
): Promise<ProfilesResponse> {
  return apiGet<ProfilesResponse>(
    c.endpoint,
    c.token,
    "/v1/profiles",
    {
      workload_id: opts.workloadId ?? opts.workload_id,
      since_hours: opts.sinceHours,
      framework: opts.framework,
      loop_type: opts.loop_type,
      team: opts.team,
    },
    signal,
  );
}

export function getEvents(
  c: Config,
  opts: { rollbacksOnly?: boolean } & FilterSet = {},
  signal?: AbortSignal,
): Promise<EventsResponse> {
  return apiGet<EventsResponse>(
    c.endpoint,
    c.token,
    "/v1/events",
    {
      rollbacks_only: opts.rollbacksOnly ? "true" : undefined,
      framework: opts.framework,
      loop_type: opts.loop_type,
      team: opts.team,
      workload_id: opts.workload_id,
    },
    signal,
  );
}

export function getCalibration(
  c: Config,
  opts: { workloadId?: string; sinceHours?: number } & FilterSet = {},
  signal?: AbortSignal,
): Promise<CalibrationResponse> {
  return apiGet<CalibrationResponse>(
    c.endpoint,
    c.token,
    "/v1/calibration",
    {
      workload_id: opts.workloadId ?? opts.workload_id,
      since_hours: opts.sinceHours,
      framework: opts.framework,
      loop_type: opts.loop_type,
      team: opts.team,
    },
    signal,
  );
}

export function getEventDetail(
  c: Config,
  id: number,
  signal?: AbortSignal,
): Promise<EventDetailResponse> {
  return apiGet<EventDetailResponse>(
    c.endpoint,
    c.token,
    `/v1/event/${id}`,
    undefined,
    signal,
  );
}

export function getAlertRules(
  c: Config,
  signal?: AbortSignal,
): Promise<AlertRulesResponse> {
  return apiGet<AlertRulesResponse>(
    c.endpoint,
    c.token,
    "/v1/alerts/rules",
    undefined,
    signal,
  );
}

export function createAlertRule(
  c: Config,
  payload: AlertRulePayload,
): Promise<AlertRuleResponse> {
  return apiSend<AlertRuleResponse>(
    c.endpoint,
    c.token,
    "/v1/alerts/rules",
    "POST",
    payload,
  );
}

export function updateAlertRule(
  c: Config,
  id: number,
  payload: AlertRulePayload,
): Promise<AlertRuleResponse> {
  return apiSend<AlertRuleResponse>(
    c.endpoint,
    c.token,
    `/v1/alerts/rules/${id}`,
    "PUT",
    payload,
  );
}

export function deleteAlertRule(
  c: Config,
  id: number,
): Promise<{ deleted: number }> {
  return apiSend<{ deleted: number }>(
    c.endpoint,
    c.token,
    `/v1/alerts/rules/${id}`,
    "DELETE",
  );
}

export function getAlertDeliveries(
  c: Config,
  signal?: AbortSignal,
): Promise<AlertDeliveriesResponse> {
  return apiGet<AlertDeliveriesResponse>(
    c.endpoint,
    c.token,
    "/v1/alerts/deliveries",
    undefined,
    signal,
  );
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

  const setDemo = useCallback((on: boolean) => {
    setDemoFlag(on);
    setDemoState(on);
  }, []);

  return useMemo(
    () => ({ config, demo, setDemo, connection, connect, disconnect, ping }),
    [config, demo, setDemo, connection, connect, disconnect, ping],
  );
}
