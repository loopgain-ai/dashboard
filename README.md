# loopgain-dashboard

Operator dashboard for the [LoopGain](https://github.com/loopgain-ai/loopgain) telemetry receiver. React + TypeScript + Vite, ~71 KB gzipped, fully client-side.

Live at [dashboard.loopgain.ai](https://dashboard.loopgain.ai) (hosted) or self-host alongside the receiver — Apache-2.0.

## Panels

1. **Overview** — fleet %-converged ring gauge, five-band counts, 30-day savings hero, 24h pulse, KPI quad, recent runs feed.
2. **Loop Health Map** — squarified treemap of recent events, band-colored, filterable by workload or band, with cluster-anomaly detection.
3. **Convergence Profiles** — per-event `profile_median` over time with band-threshold backgrounds and rolling-median trend.
4. **Waste Report** — saved-dollars hero, counterfactual baseline, by-workload + by-outcome breakdowns, stacked-area spend timeseries.
5. **Rollback Log** — every divergence-triggered rollback as an expandable audit-trail row; CSV / JSON export with on-the-fly SHA-256 audit hash.
6. **Alerts** — read-only delivery audit log + active-rule summary; rule editing lives in **Settings**.

Plus a **Loop Detail** drill-down per workload (header KPIs, per-workload convergence chart, recent runs sidebar, per-iteration trajectory scrubbing for v3+-schema runs), **Settings** (connection state, cost-per-iter, alert rules editor with **webhook / Slack / email** delivery channels and a per-rule **Test** button that fires the real delivery path once), an **Empty State** with a three-line Python integration snippet, and a **⌘K command palette** for nav / actions / workload jumps.

A filter bar across the top of every data panel scopes by `framework`, `loop_type`, and `team` (populated from the receiver's distinct-values list).

The dashboard supports light & dark themes, cozy / dense density, and a **demo mode** that runs the whole UI against a deterministic synthetic fleet — useful for screenshots and offline development.

## Architecture

```
[browser] --bearer-auth--> [telemetry-receiver Worker] --D1--> [loop_events, alert_rules, alert_deliveries]
                                  │
                                  ├── GET /v1/stats
                                  ├── GET /v1/profiles
                                  ├── GET /v1/events
                                  ├── GET /v1/event/:id
                                  ├── GET /v1/alerts/rules
                                  ├── GET /v1/alerts/deliveries
                                  ├── POST/PUT/DELETE /v1/alerts/rules[/:id]
                                  └── POST /v1/alerts/rules/:id/test
```

Fully client-side. The user's bearer token lives in `localStorage` and is sent only to the configured endpoint. No backend, no cookies, no third-party scripts, no telemetry of its own.

## Stack

- React 18 + TypeScript (strict mode).
- Vite (`vite build` → `dist/`).
- Hand-built SVG charts. Zero charting-library dependencies.
- Design tokens + a small component layer. No CSS framework.

## Project layout

```
src/
├── App.tsx                       routing, theme/density, keybindings, polling
├── main.tsx                      entry
├── styles/                       tokens.css + base.css + components.css
├── types.ts                      wire shapes mirroring the receiver
├── lib/
│   ├── api.ts                    typed fetch client + AuthContext + useApi hook
│   ├── data-hooks.ts             useStats / useProfiles / useEvents / useAlert*
│   ├── demo.ts                   deterministic synthetic telemetry
│   ├── bands.ts                  band semantics, outcome→band mapping
│   ├── stats.ts                  percentile, histogram, groupBy helpers
│   └── format.ts                 display formatters
└── components/
    ├── primitives/               StatePill, Chip, KPI, Tooltip, PanelHeader, Icon
    ├── charts/                   SVG chart components
    ├── shell/                    Sidebar, TopBar, FilterBar, CommandPalette, routes
    ├── auth/                     ConnectDialog
    └── panels/                   one file per route
```

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit && vite build → dist/
npm run preview      # serve dist/ on :4173
npm run typecheck
```

On first load with no configured endpoint, the dashboard shows the empty state. Click **Use demo data** to explore against the synthetic fleet, or **Connect endpoint** to paste your receiver URL + bearer token.

## Deploying to Cloudflare

Connected to Cloudflare via Git (Workers with static assets) — pushing to `main` auto-deploys. Production custom domain: `dashboard.loopgain.ai`.

Cloudflare runs `npm run build` (which is `tsc --noEmit && vite build`) and then `npx wrangler deploy`. `wrangler.jsonc` declares `dist/` as the asset directory and enables SPA fallback. `.nvmrc` pins Node 22 so the build env matches local.

One-off manual deploy:

```bash
npm run build
npx wrangler deploy
```

TLS is automatic on Cloudflare-managed custom domains. `public/_headers` carries CSP / HSTS / X-Frame-Options.

## Connecting to a receiver

1. The endpoint URL of your telemetry receiver (e.g., `https://telemetry.loopgain.ai`).
2. A bearer token from the receiver operator — see the [receiver README](https://github.com/loopgain-ai/telemetry-receiver#issuing-a-bearer-token).

On first load the dashboard shows a connect prompt. Paste both; they're stored in `localStorage` and reused. To rotate or disconnect: log-out icon in the top bar, or **Settings → Connection → Disconnect**.

## Self-hosting the full stack

Both the receiver and the dashboard are Apache-2.0:

1. Deploy the [telemetry-receiver](https://github.com/loopgain-ai/telemetry-receiver) to your Cloudflare account.
2. Deploy this dashboard to Cloudflare (or any static host).
3. Issue a token with the receiver's `scripts/issue-token.mjs`.
4. Point the library's `send_telemetry(endpoint=...)` at your receiver.
5. Open the dashboard, paste endpoint + token.

Nothing leaves your infrastructure.

## License

[Apache-2.0](LICENSE).
