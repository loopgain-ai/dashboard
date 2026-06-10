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
  AlertTestResponse,
  Config,
  EventDetailResponse,
  EventsResponse,
  FilterSet,
  HealthResponse,
  ProfilesResponse,
  StatsResponse,
} from "../types";

const STORAGE_KEY = "loopgain-dashboard-config";

// Public-bench routes on the production receiver. CORS is wildcard there,
// so this URL works from any origin (prod dashboard, npm-run-dev localhost,
// incognito previews — all hit the same managed receiver).
export const BENCH_PUBLIC_BASE = "https://telemetry.loopgain.ai";
const BENCH_PUBLIC_PREFIX = "/v1/public/benchmark";

/** True when the current pathname is the public benchmark route. Read once
 *  at module load — bench-mode is a property of the URL the user landed on,
 *  not a runtime toggle. SSR-safe (returns false if `window` is undefined). */
export function isBenchPath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/benchmark");
}

/** True when the current pathname is the parameterized demo route. Like
 *  bench-mode, decided once at mount from the URL. Demo-mode reuses the
 *  bench public endpoints (no auth needed) and applies a client-side
 *  scaling transform driven by the visitor's DemoParams selections.
 *  SSR-safe (returns false if `window` is undefined). */
export function isDemoPath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/demo");
}

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

// ── Public bench endpoint wrappers ────────────────────────────────────
//
// Parallel to the authed wrappers below, but: (a) no Authorization header
// (the public routes skip auth and hardcode `cust_7931de9f766452ac` in
// the receiver), (b) target a fixed base URL, (c) follow `/v1/public/
// benchmark/*` paths. Used by data-hooks when the dashboard is mounted at
// `/benchmark` (see `isBenchPath`). Same JSON shape as the authed reads —
// data-hooks don't need a type-level switch.

function buildPublicUrl(
  path: string,
  params?: Record<string, string | number | undefined>,
): string {
  const u = new URL(BENCH_PUBLIC_BASE + BENCH_PUBLIC_PREFIX + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function publicGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const resp = await fetch(buildPublicUrl(path, params), { signal });
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

export function getStatsBench(signal?: AbortSignal): Promise<StatsResponse> {
  return publicGet<StatsResponse>("/stats", undefined, signal);
}

export function getProfilesBench(
  opts: { workloadId?: string; sinceHours?: number } & FilterSet = {},
  signal?: AbortSignal,
): Promise<ProfilesResponse> {
  return publicGet<ProfilesResponse>(
    "/profiles",
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

export function getEventsBench(
  opts: { rollbacksOnly?: boolean } & FilterSet = {},
  signal?: AbortSignal,
): Promise<EventsResponse> {
  return publicGet<EventsResponse>(
    "/events",
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

export function getEventDetailBench(
  id: number,
  signal?: AbortSignal,
): Promise<EventDetailResponse> {
  return publicGet<EventDetailResponse>(`/event/${id}`, undefined, signal);
}

export function getAlertRulesBench(signal?: AbortSignal): Promise<AlertRulesResponse> {
  return publicGet<AlertRulesResponse>("/alerts/rules", undefined, signal);
}

export function getAlertDeliveriesBench(
  signal?: AbortSignal,
): Promise<AlertDeliveriesResponse> {
  return publicGet<AlertDeliveriesResponse>("/alerts/deliveries", undefined, signal);
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

// Fire the rule's delivery channel once with a marked test payload. The
// receiver records the result in the deliveries audit trail as
// test_sent/test_failed; the rule's cooldown is not consumed.
export function testAlertRule(
  c: Config,
  id: number,
): Promise<AlertTestResponse> {
  return apiSend<AlertTestResponse>(
    c.endpoint,
    c.token,
    `/v1/alerts/rules/${id}/test`,
    "POST",
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
  /** Parameterized projection view (`/demo` path). Set once at mount from
   *  the URL. Data-hooks fetch from the bench public endpoints and apply
   *  a client-side scaling transform driven by DemoParamsCtx selections.
   *  See src/lib/demo.ts for the transform layer. */
  demo: boolean;
  /** Read-only public benchmark view (`/benchmark` path). Set once at mount
   *  from the URL; data-hooks route to `/v1/public/benchmark/*` when true. */
  bench: boolean;
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
  opts: {
    pollMs?: number;
    refreshTrigger?: number;
    /** Bench-mode loader. Runs without a config (no auth) and takes
     *  precedence over `loader` when `bench` is true in AuthCtx. Pass
     *  `null` to keep the panel idle (e.g. event-detail with no id yet). */
    benchLoader?: ((signal: AbortSignal) => Promise<T>) | null;
  } = {},
): { state: LoadState<T>; refresh: () => void } {
  const { config, demo, bench } = useAuth();
  const [state, setState] = useState<LoadState<T>>({ status: "idle" });
  const [tick, setTick] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    // Bench/demo short-circuit: when a public-routes loader is provided,
    // run it instead of the authed loader. Demo mode supplies a
    // benchLoader that fetches bench data and applies a scaling transform
    // (see src/lib/demo.ts). Bench mode supplies a benchLoader that
    // returns the raw bench data unchanged.
    if (bench || demo) {
      if (!opts.benchLoader) {
        setState({ status: "idle" });
        return;
      }
      const ctrl = new AbortController();
      setState((s) =>
        s.status === "ok"
          ? { status: "loading", previous: s.data }
          : { status: "loading" },
      );
      opts.benchLoader(ctrl.signal)
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
    }
    if (!loader) {
      setState({ status: "idle" });
      return;
    }
    if (!config) {
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
  }, [config?.endpoint, config?.token, demo, bench, tick, opts.refreshTrigger, ...deps]);

  useEffect(() => {
    if (!opts.pollMs) return;
    // Visibility-gated polling: only refresh while the tab is actually being
    // looked at, and refresh immediately when it regains focus so the user
    // sees fresh data the moment they return. A backgrounded or forgotten-open
    // tab costs nothing — fitting for a cost-control product.
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const id = window.setInterval(tick, opts.pollMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [opts.pollMs, refresh]);

  return { state, refresh };
}

/** Build a `useApi` loader from one of the endpoint wrappers. */
export function asLoader<T>(fn: (c: Config, signal?: AbortSignal) => Promise<T>) {
  return (c: Config, signal: AbortSignal) => fn(c, signal);
}

export function useAuthProvider(): AuthCtx {
  // Bench + demo are decided once at mount from the URL. Mutually
  // exclusive (bench wins on the /benchmark path). Both override config:
  // the dashboard treats /benchmark and /demo as sealed contexts whose
  // data comes from the public endpoints.
  const bench = useMemo(() => isBenchPath(), []);
  const demo = useMemo(() => !bench && isDemoPath(), [bench]);
  const [config, setConfig] = useState<Config | null>(() =>
    bench || demo ? null : loadConfig(),
  );
  const [connection, setConnection] = useState<ConnectionState>(() => {
    if (bench) return { status: "connected", customerId: "cust_7931de9f766452ac" };
    if (demo) return { status: "connected", customerId: "demo-projection" };
    return loadConfig()
      ? { status: "connected", customerId: null }
      : { status: "disconnected" };
  });

  const connect = useCallback(async (c: Config) => {
    setConnection({ status: "connecting" });
    try {
      await getHealth(c.endpoint);
      const stats = await getStats(c);
      saveConfig(c);
      setConfig(c);
      setConnection({ status: "connected", customerId: stats.customer_id });
      // `demo`/`bench` are decided once at mount from the URL and OVERRIDE
      // config in every data hook (see useApi's `if (bench || demo)` short-
      // circuit). So connecting while on /demo or /benchmark stores the token
      // but keeps rendering public data — the user appears "stuck on demo".
      // Navigate to the authed root so the app remounts with demo=bench=false
      // and the freshly-stored config takes effect. Mirror image of
      // disconnect()'s redirect to /demo.
      if (typeof window !== "undefined") {
        const p = window.location.pathname;
        if (p.startsWith("/demo") || p.startsWith("/benchmark")) {
          window.location.assign("/");
        }
      }
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
    // Per the "no token defaults to demo" rule: disconnecting on an
    // authed dashboard sends the user to /demo (the public projection)
    // rather than leaving them on / with the install snippet. Matches
    // the initial-load redirect in main.tsx so the rule is consistent
    // across both code paths. Skip the redirect if we're already on a
    // public route (bench/demo) — those don't reach this handler via
    // the disconnect button anyway, but defense-in-depth.
    if (typeof window !== "undefined") {
      const p = window.location.pathname;
      if (!p.startsWith("/demo") && !p.startsWith("/benchmark")) {
        window.location.replace("/demo");
      }
    }
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

  return useMemo(
    () => ({ config, demo, bench, connection, connect, disconnect, ping }),
    [config, demo, bench, connection, connect, disconnect, ping],
  );
}
