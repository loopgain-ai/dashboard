// Account pages — /signup and /login (with password reset), the single
// front door every "get a token" CTA converges on (landing pricing, demo
// banner, EmptyState). Backed by the capture Worker's /api/auth/* routes
// on loopgain.ai (see loopgain-capture/src/auth.js):
//
//   sign up (email + password + Turnstile) → verification email →
//   verify click mints the telemetry token server-side + emails setup
//   instructions → log in returns {endpoint, token} and the dashboard
//   configures itself. No credential copy-pasting.
//
// These render standalone (no panels, no AuthProvider needed) — App.tsx
// routes here on pathname before mounting the dashboard shell.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { saveConfig } from "../../lib/api";
import { resumePendingVesperConnection } from "./VesperConnectPage";

const AUTH_BASE = "https://loopgain.ai/api/auth";
// Public Turnstile site key (same widget the landing forms use).
const TURNSTILE_SITEKEY = "0x4AAAAAADiBMO_v3Ti_3EcA";

interface AuthOk {
  ok: true;
  session?: string;
  email?: string;
  message?: string;
  config?: { endpoint: string; token: string; customer_id?: string } | null;
}
interface AuthErr {
  ok: false;
  error: string;
}

async function authPost(path: string, body: unknown): Promise<AuthOk | AuthErr> {
  try {
    const res = await fetch(`${AUTH_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as AuthOk | AuthErr;
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }
}

/* ── Turnstile (explicit render) ──────────────────────────────────── */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      getResponse: (id: string) => string | undefined;
      reset: (id: string) => void;
    };
  }
}

function useTurnstile(): {
  slot: ReactNode;
  /** Resolve the current token, waiting for the widget if it hasn't
   *  finished verifying yet — the invisible challenge takes a moment,
   *  and submitting before it resolves must wait, not fail. */
  waitForToken: (timeoutMs?: number) => Promise<string>;
  /** Mint a fresh token after a failed attempt (tokens are single-use —
   *  resubmitting a consumed one fails verification server-side). */
  reset: () => void;
} {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    function render() {
      if (cancelled || !ref.current || widgetId.current !== null || !window.turnstile) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITEKEY,
        appearance: "interaction-only",
        theme: "auto",
      });
    }
    if (window.turnstile) {
      render();
    } else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => {
      cancelled = true;
    };
  }, []);
  const getToken = () => {
    if (!window.turnstile || widgetId.current === null) return "";
    try {
      return window.turnstile.getResponse(widgetId.current) || "";
    } catch {
      return "";
    }
  };
  return {
    // The widget box sits directly above the submit button — keep air
    // between them when it becomes visible (interactive/success states).
    slot: <div ref={ref} style={{ minHeight: 0, marginBottom: 14 }} />,
    waitForToken: async (timeoutMs = 15000) => {
      const deadline = Date.now() + timeoutMs;
      let token = getToken();
      while (!token && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
        token = getToken();
      }
      return token;
    },
    reset: () => {
      if (window.turnstile && widgetId.current !== null) {
        try {
          window.turnstile.reset(widgetId.current);
        } catch {
          /* widget gone — next submit will surface it */
        }
      }
    },
  };
}

/* ── shared shell ─────────────────────────────────────────────────── */

function AuthShell({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <a href="https://loopgain.ai" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontSize: 18, fontWeight: 650, color: "var(--text-1)" }}>
              Loop<span style={{ color: "var(--accent)" }}>Gain</span>
            </span>
          </a>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 600, color: "var(--text-1)" }}>{title}</h1>
          {sub && <p style={{ margin: "0 0 18px", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-3)" }}>{sub}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  height: 38,
  padding: "0 12px",
  background: "var(--surf-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-1)",
  fontSize: 13.5,
  marginBottom: 12,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  background: "var(--accent)",
  color: "var(--bg-0)",
  border: "none",
  borderRadius: 6,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      style={{
        marginBottom: 12,
        padding: "9px 12px",
        borderRadius: 6,
        background: "color-mix(in oklab, var(--band-osc) 10%, transparent)",
        border: "1px solid color-mix(in oklab, var(--band-osc) 30%, transparent)",
        color: "var(--band-osc)",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {error}
    </div>
  );
}

/* ── /signup ──────────────────────────────────────────────────────── */

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [consent, setConsent] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const turnstile = useTurnstile();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    // The invisible browser check takes a moment — wait for its token
    // instead of submitting an empty one (which reads as a failure).
    const tsToken = await turnstile.waitForToken();
    if (!tsToken) {
      setBusy(false);
      setError("Couldn't complete the browser check — please reload and try again.");
      return;
    }
    const res = await authPost("/signup", {
      email,
      password,
      consent,
      newsletter_optin: newsletter,
      cf_turnstile_response: tsToken,
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
    } else {
      setError(res.error);
      // Tokens are single-use; mint a fresh one so a retry can succeed.
      turnstile.reset();
    }
  }

  if (done) {
    return (
      <AuthShell title="Check your inbox ✉️">
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: "var(--text-2)" }}>
          We sent a verification link to{" "}
          <span className="mono" style={{ color: "var(--text-1)" }}>{email}</span>.
          Click it to activate your account — your free dashboard token is minted
          the moment you verify, and setup instructions arrive in the same inbox.
        </p>
        <p
          style={{
            margin: "14px 0 0",
            padding: "10px 12px",
            borderRadius: 6,
            background: "color-mix(in oklab, var(--accent) 8%, transparent)",
            border: "1px solid color-mix(in oklab, var(--accent) 25%, transparent)",
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "var(--text-2)",
          }}
        >
          Not there after a minute? <strong>Check your junk/spam folder</strong> —
          first emails from a new sender often land there. Marking it "not junk"
          keeps the setup email out of it too.
        </p>
        <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--text-3)" }}>
          Already verified? <a href="/login" style={{ color: "var(--accent)" }}>Log in</a>.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      sub={
        <>
          Free forever on the Individual tier — hosted dashboard, single user,
          7-day retention. Your telemetry token is created automatically when
          you verify your email.
        </>
      }
    >
      <form onSubmit={submit}>
        <ErrorLine error={error} />
        <input
          style={inputStyle}
          type="email"
          required
          placeholder="you@company.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={inputStyle}
          type="password"
          required
          minLength={10}
          placeholder="Password (10+ characters)"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          style={inputStyle}
          type="password"
          required
          placeholder="Confirm password"
          autoComplete="new-password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
        />
        <label
          style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 8 }}
        >
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            I agree to LoopGain&apos;s{" "}
            <a href="https://loopgain.ai/terms" target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="https://loopgain.ai/privacy" target="_blank" rel="noopener" style={{ color: "var(--accent)" }}>
              Privacy Policy
            </a>
            .
          </span>
        </label>
        <label
          style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, marginBottom: 14 }}
        >
          <input
            type="checkbox"
            checked={newsletter}
            onChange={(e) => setNewsletter(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>Also send me new LoopGain blog posts (optional; unsubscribe any time).</span>
        </label>
        {turnstile.slot}
        <button type="submit" style={buttonStyle} disabled={busy}>
          {busy ? "Creating account…" : "Sign up — free"}
        </button>
      </form>
      <p style={{ margin: "16px 0 0", fontSize: 12, color: "var(--text-3)" }}>
        Already have an account? <a href="/login" style={{ color: "var(--accent)" }}>Log in</a>
        {" · "}
        <a href="/demo" style={{ color: "var(--accent)" }}>watch the live demo</a> first
      </p>
    </AuthShell>
  );
}

/* ── /login (+ reset) ─────────────────────────────────────────────── */

export function LoginPage() {
  const resetToken =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("reset")
      : null;
  return resetToken ? <ResetForm token={resetToken} /> : <LoginForm />;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await authPost("/login", { email, password });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.session) {
      try {
        localStorage.setItem("loopgain-account-session", res.session);
        if (res.email) localStorage.setItem("loopgain-account-email", res.email);
      } catch {
        /* storage unavailable — config alone still works */
      }
    }
    if (res.config) {
      // The whole point: the dashboard configures itself from the account.
      saveConfig({ endpoint: res.config.endpoint, token: res.config.token });
      if (!resumePendingVesperConnection()) window.location.assign("/");
    } else {
      setError(
        "Logged in, but no dashboard token is attached to this account yet — check your verification email, or contact hello@loopgain.ai.",
      );
    }
  }

  async function requestReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await authPost("/reset-request", { email });
    setBusy(false);
    if (res.ok) setForgotSent(true);
    else setError(res.error);
  }

  if (forgot) {
    return (
      <AuthShell
        title="Reset your password"
        sub="Enter your account email — we'll send a reset link (valid for 1 hour)."
      >
        {forgotSent ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--text-2)" }}>
            If that address has an account, a reset link is on its way. Check your
            inbox — and your junk/spam folder if it isn&apos;t there in a minute.
          </p>
        ) : (
          <form onSubmit={requestReset}>
            <ErrorLine error={error} />
            <input
              style={inputStyle}
              type="email"
              required
              placeholder="you@company.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" style={buttonStyle} disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p style={{ margin: "16px 0 0", fontSize: 12, color: "var(--text-3)" }}>
          <a href="/login" style={{ color: "var(--accent)" }}>Back to log in</a>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Log in"
      sub="Your dashboard configures itself — the telemetry token attached to your account loads automatically."
    >
      <form onSubmit={submit}>
        <ErrorLine error={error} />
        <input
          style={inputStyle}
          type="email"
          required
          placeholder="you@company.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={inputStyle}
          type="password"
          required
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" style={buttonStyle} disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p style={{ margin: "16px 0 0", fontSize: 12, color: "var(--text-3)" }}>
        <button
          type="button"
          onClick={() => setForgot(true)}
          style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", cursor: "pointer", fontSize: 12 }}
        >
          Forgot password?
        </button>
        {" · "}
        New here? <a href="/signup" style={{ color: "var(--accent)" }}>Sign up — free</a>
      </p>
    </AuthShell>
  );
}

function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== password2) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await authPost("/reset", { token, password });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error);
  }

  return (
    <AuthShell title="Set a new password">
      {done ? (
        <>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--text-2)" }}>
            Password updated — log in with your new password.
          </p>
          <p style={{ margin: "16px 0 0", fontSize: 12 }}>
            <a href="/login" style={{ color: "var(--accent)" }}>Go to log in →</a>
          </p>
        </>
      ) : (
        <form onSubmit={submit}>
          <ErrorLine error={error} />
          <input
            style={inputStyle}
            type="password"
            required
            minLength={10}
            placeholder="New password (10+ characters)"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            style={inputStyle}
            type="password"
            required
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
          <button type="submit" style={buttonStyle} disabled={busy}>
            {busy ? "Updating…" : "Set new password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
