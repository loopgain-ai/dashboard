// Endpoint + bearer-token entry. Mirrors the existing vanilla dashboard's
// flow: validate by hitting /health then /v1/stats before persisting.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_ENDPOINT = "https://telemetry.loopgain.ai";

export function ConnectDialog({ open, onClose }: Props) {
  const { config, connect, demo, setDemo } = useAuth();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [endpoint, setEndpoint] = useState(config?.endpoint ?? DEFAULT_ENDPOINT);
  const [token, setToken] = useState(config?.token ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setEndpoint(config?.endpoint ?? DEFAULT_ENDPOINT);
    setToken(config?.token ?? "");
    setError(null);
  }, [open, config]);

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const ep = endpoint.trim().replace(/\/$/, "");
    const tk = token.trim();
    if (!ep || !tk) {
      setError("Endpoint and token are both required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await connect({ endpoint: ep, token: tk });
      if (demo) setDemo(false);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function tryDemo(): void {
    setDemo(true);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: 460,
          background: "var(--surf-1)",
          border: "1px solid var(--border-2)",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          color: "var(--text-1)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            Connect to your telemetry receiver
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
            Paste the endpoint URL and bearer token issued when you provisioned your customer
            account. Stored in browser localStorage — every API call goes direct to the endpoint
            you specify; no third parties.
          </p>
        </div>

        <label className="field">
          <span>Endpoint URL</span>
          <input
            type="url"
            placeholder={DEFAULT_ENDPOINT}
            required
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            autoFocus
          />
        </label>

        <label className="field">
          <span>Bearer token</span>
          <input
            type="password"
            placeholder="lgk_..."
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </label>

        {error && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--band-osc)",
              fontFamily: "var(--mono)",
              padding: "8px 10px",
              borderRadius: 5,
              background: "color-mix(in oklab, var(--band-osc) 8%, transparent)",
              border: "1px solid color-mix(in oklab, var(--band-osc) 30%, transparent)",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}>
          <button type="button" className="chip" onClick={tryDemo}>
            Use demo data
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="chip" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="chip on"
              disabled={busy}
              style={{
                background: busy ? "var(--surf-3)" : "var(--accent)",
                color: busy ? "var(--text-2)" : "#06080d",
                border: "1px solid var(--accent)",
              }}
            >
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
