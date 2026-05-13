# loopgain-dashboard

Static dashboard for the [LoopGain](https://github.com/loopgain-ai/loopgain) telemetry. Vanilla HTML + JS + [Chart.js](https://www.chartjs.org/) via CDN. No build step. Deployable to Cloudflare Pages, GitHub Pages, or any static host.

Three panels in v0.1:

1. **Loop Health Map** — recent loops colored by outcome (converged / stalling / oscillating / diverged / max_iterations).
2. **Convergence Profiles** — smoothed Aβ median + max per loop over time. Drift upward = prompts or models getting harder. Optional filter by `workload_id`.
3. **Waste Report** — iterations saved vs an assumed fixed cap of 10, with a configurable per-iteration cost for $-conversion. The ROI panel.

Plus a KPI strip (30-day totals: loops, iterations saved, rollbacks, outcome breakdown).

Future panels (Gain Margin Distribution, Rollback Log, ETA Accuracy) are deferred to v0.2.

---

## Access

The dashboard codebase is Apache-2.0 — anyone can self-host the full stack (this dashboard + the [telemetry-receiver](https://github.com/loopgain-ai/telemetry-receiver)) on their own infrastructure with no permission needed.

To use the hosted instance at `dashboard.loopgain.ai`, you need a bearer token issued from the receiver. During the v0.1 alpha, tokens are issued manually — get in touch if you want one. A self-serve sign-up flow with tiered access (free / Team / Enterprise) is planned for v0.2+.

In all cases, the dashboard is fully client-side: your token lives in `localStorage` and is sent only to the configured endpoint. Nothing is shared between accounts.

---

## Architecture

```
[user browser] --bearer-auth--> [telemetry-receiver Worker] --D1--> [loop_events]
```

The dashboard is fully client-side. It reads from the receiver's API directly using the user's bearer token, stored in `localStorage` (never sent anywhere except the configured endpoint). No backend; no database; no cookies; no third-party tracking; no telemetry of its own.

External dependencies, all CDN-loaded with `defer`:

- [Chart.js 4.4.0](https://cdn.jsdelivr.net/npm/chart.js@4.4.0/) — line charts only

That's the entire dependency surface.

---

## Local development

Any static file server works:

```bash
# Python 3
python3 -m http.server 5173

# Or Node
npx serve .
```

Open http://localhost:5173. Click **Connect**, paste your endpoint URL and bearer token, and the dashboard loads.

---

## Deploying to Cloudflare Pages

```bash
# One-time
npx wrangler pages project create loopgain-dashboard

# Deploy
npx wrangler pages deploy . --project-name=loopgain-dashboard
```

After deploy, point your domain DNS (e.g., `dashboard.loopgain.ai` or just `loopgain.ai`) at the Pages project. Cloudflare auto-issues TLS.

---

## Connecting

You need:

1. The endpoint URL of your telemetry receiver (e.g., `https://telemetry.loopgain.ai`).
2. A bearer token. The receiver's operator issues this — see the [receiver README](https://github.com/loopgain-ai/telemetry-receiver#issuing-a-bearer-token-to-a-customer).

On first load, the dashboard shows a connect prompt. Paste both values; they're stored in `localStorage` and reused on subsequent visits.

To rotate or disconnect: click **config** in the header and update or clear the form.

---

## Self-hosting

Both the receiver and the dashboard are Apache-2.0. To run the full stack under your own control:

1. Clone and deploy the [telemetry-receiver](https://github.com/loopgain-ai/telemetry-receiver) to your Cloudflare account.
2. Clone this repo and deploy to Cloudflare Pages (or any static host).
3. Issue a token via the receiver's `scripts/issue-token.mjs`.
4. Point the library's `send_telemetry(endpoint=...)` at your receiver.
5. Point your browser at your dashboard, paste the endpoint + token, done.

Nothing leaves your infrastructure.

---

## License

[Apache-2.0](LICENSE).
