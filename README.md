# loopgain-dashboard

Six-panel SaaS dashboard for the [LoopGain](https://github.com/loopgain-ai/loopgain) telemetry receiver. React + TypeScript + Vite. Static build; deployable to Cloudflare Pages, GitHub Pages, or any static host.

## What's in v0.2

All six panels from the LoopGain product spec, plus a Loop Detail drill-down view:

1. **Overview** — fleet `Aβ_median` ring gauge, five-band counts, 30-day savings hero, 24h pulse, KPI quad, recent runs feed.
2. **Loop Health Map** — squarified treemap of recent loop events, band-colored, filterable by workload or band. Cluster-anomaly detection on the active window.
3. **Convergence Profiles** — per-event `profile_median` plotted over time with band-threshold backgrounds and a rolling-median trend line. Optional per-workload filter.
4. **Waste Report** — hero saved-dollars number, counterfactual baseline, by-workload & by-outcome breakdowns, stacked-area spend timeseries.
5. **Gain Margin Distribution** — fleet histogram of `GM = 1 / max(Aβ_smooth)` with reference markers at 1.0 / 1.2 / 1.8 and per-bucket workload drill-in.
6. **Rollback Log** — every divergence-triggered rollback as an expandable audit-trail row, CSV/JSON export, real on-the-fly SHA-256 audit hash.
7. **ETA Accuracy** *(coming in schema v2)* — predicted-vs-actual calibration. Honest placeholder for now: the v1 telemetry schema doesn't carry `predicted_iterations`.

Plus: **Loop Detail** drill-down per workload (header KPIs + per-workload convergence chart + recent runs sidebar), **Settings** (connection state, cost-per-iter, alert rules editor — alert delivery is local-only until v0.2 wire-up), **Empty State** with the three-line Python integration snippet, and a **⌘K command palette** with nav / actions / workload jumps.

The dashboard supports light & dark themes, cozy/dense density, and a demo mode that runs the whole UI against a deterministic synthetic fleet (no backend required).

## Architecture

```
[user browser] --bearer-auth--> [telemetry-receiver Worker] --D1--> [loop_events]
                                       │
                                       ├── GET /v1/stats
                                       ├── GET /v1/profiles?workload_id=&since_hours=
                                       └── GET /v1/events?rollbacks_only=
```

Fully client-side. The user's bearer token lives in `localStorage` and is sent only to the configured endpoint. No backend, no cookies, no third-party scripts, no telemetry of its own.

## Stack

- React 18 + TypeScript (strict mode, no implicit any, `exactOptionalPropertyTypes` off so `?:` props behave normally).
- Vite for the build (`vite build` → `dist/`, ~71 KB gzipped JS + 2.5 KB gzipped CSS).
- All charts are hand-built SVG (Sparkline, RingGauge, ConvergenceOverTime, Histogram, AreaChart, HBar). Zero charting-library dependencies.
- No CSS framework. Design tokens + a small component layer.

## Project layout

```
src/
├── App.tsx                       — routing, theme/density, keybindings, polling
├── main.tsx                      — entry
├── styles/                       — tokens.css + base.css + components.css
├── types.ts                      — wire shapes mirroring the receiver
├── lib/
│   ├── api.ts                    — typed fetch client + AuthContext + useApi hook
│   ├── data-hooks.ts             — useStats / useProfiles / useEvents (live + demo)
│   ├── demo.ts                   — deterministic synthetic telemetry
│   ├── bands.ts                  — band semantics, outcome→band mapping
│   ├── stats.ts                  — percentile, histogram, groupBy helpers
│   └── format.ts                 — display formatters
└── components/
    ├── primitives/               — StatePill, Chip, KPI, Tooltip, PanelHeader, Icon
    ├── charts/                   — SVG chart components
    ├── shell/                    — Sidebar, TopBar, CommandPalette, routes
    ├── auth/                     — ConnectDialog
    └── panels/                   — one file per route
```

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit && vite build → dist/
npm run preview      # serve dist/ on :4173
npm run typecheck
```

On first load with no configured endpoint the dashboard shows the empty state. Click **Use demo data** to explore against the synthetic fleet, or **Connect endpoint** to paste your receiver URL + bearer token.

## Deploying to Cloudflare

Connected to Cloudflare via Git (Workers with static assets) — pushing to `main` auto-deploys. Production custom domain: `dashboard.loopgain.ai`.

Cloudflare runs `npm run build` (which is `tsc --noEmit && vite build`) and then `npx wrangler deploy`; the `wrangler.jsonc` in this repo declares `dist/` as the asset directory and enables SPA fallback. `.nvmrc` pins Node 22 so the build env matches local.

For a one-off manual deploy from local:

```bash
npm run build
npx wrangler deploy
```

TLS is automatic on Cloudflare-managed custom domains.

## Connecting to a receiver

You need:

1. The endpoint URL of your telemetry receiver (e.g., `https://telemetry.loopgain.ai`).
2. A bearer token issued by the receiver operator — see the [receiver README](https://github.com/loopgain-ai/telemetry-receiver#issuing-a-bearer-token-to-a-customer).

On first load the dashboard shows a connect prompt. Paste both; they're stored in `localStorage` and reused. To rotate or disconnect: log out icon in the top bar, or **Settings → Connection → Disconnect**.

## Self-hosting the full stack

Both the receiver and the dashboard are Apache-2.0:

1. Deploy the [telemetry-receiver](https://github.com/loopgain-ai/telemetry-receiver) to your Cloudflare account.
2. Deploy this dashboard to Cloudflare Pages (or any static host).
3. Issue a token via the receiver's `scripts/issue-token.mjs`.
4. Point the library's `send_telemetry(endpoint=...)` at your receiver.
5. Point your browser at your dashboard, paste endpoint + token.

Nothing leaves your infrastructure.

## Honest scope (v0.2)

A few things are deliberately *not* in this build because the v1 telemetry schema doesn't carry the data, and rendering synthetic values would have looked like real analytics:

- **ETA Accuracy panel** — needs `predicted_iterations_at_observe()` in the library + a schema-v2 field. Surfaces as a "schema v2 required" placeholder explaining what it will plot.
- **Per-iteration trajectory scrubbing in Loop Detail** — telemetry stores summary stats per run (`profile_min/median/max`), not the full per-iteration array. Replaced with a per-run summary list.
- **Alert delivery** — the alert-rule editor in Settings persists rules to `localStorage`, but the receiver doesn't yet have a delivery worker. Surfaces as a "not yet wired up" note.
- **Loop-type / framework / team filters** — telemetry only carries `workload_id`. Replaced with workload + band filters.

When the receiver schema rolls forward, those panels light up without UI rework.

## License

[Apache-2.0](LICENSE).
