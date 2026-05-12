/**
 * LoopGain dashboard — vanilla JS app.
 *
 * Reads telemetry from a customer-configured endpoint (the loopgain
 * telemetry receiver) using a bearer token. Token + endpoint are stored
 * in localStorage; data is fetched on connect and on refresh.
 *
 * Privacy: this dashboard makes requests only to the user-configured
 * endpoint and to the Chart.js CDN. No analytics, no third-party scripts,
 * no telemetry of its own.
 */

const STORAGE_KEY = "loopgain-dashboard-config";

/** @type {{endpoint: string, token: string} | null} */
let config = null;
let convergenceChart = null;

// ----- DOM references -----
const els = {
  main: document.getElementById("main"),
  emptyState: document.getElementById("empty-state"),
  emptyStateConnect: document.getElementById("empty-state-connect"),
  configBtn: document.getElementById("config-btn"),
  configDialog: document.getElementById("config-dialog"),
  configForm: document.getElementById("config-form"),
  configCancel: document.getElementById("config-cancel"),
  configError: document.getElementById("config-error"),
  endpointInput: document.getElementById("endpoint-input"),
  tokenInput: document.getElementById("token-input"),
  refreshBtn: document.getElementById("refresh-btn"),
  connectionStatus: document.getElementById("connection-status"),
  endpointDisplay: document.getElementById("endpoint-display"),
  customerDisplay: document.getElementById("customer-display"),
  // KPIs
  kpiLoops: document.getElementById("kpi-loops"),
  kpiSavings: document.getElementById("kpi-savings"),
  kpiRollbacks: document.getElementById("kpi-rollbacks"),
  kpiOutcomes: document.getElementById("kpi-outcomes"),
  // Health map
  healthGrid: document.getElementById("health-grid"),
  // Convergence
  workloadFilter: document.getElementById("workload-filter"),
  convergenceCanvas: document.getElementById("convergence-chart"),
  // Waste
  costInput: document.getElementById("cost-input"),
  wasteIters: document.getElementById("waste-iters"),
  wasteDollars: document.getElementById("waste-dollars"),
  wastePerLoop: document.getElementById("waste-per-loop"),
};

// ----- Init -----
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  attachEventListeners();
  if (config) {
    showDashboard();
    refresh();
  } else {
    showEmptyState();
  }
});

function attachEventListeners() {
  els.configBtn.addEventListener("click", openConfig);
  els.emptyStateConnect.addEventListener("click", openConfig);
  els.configCancel.addEventListener("click", () => els.configDialog.close());
  els.configForm.addEventListener("submit", onConfigSubmit);
  els.refreshBtn.addEventListener("click", refresh);
  els.workloadFilter.addEventListener("change", refreshConvergence);
  els.costInput.addEventListener("input", refreshWasteReport);
}

// ----- Config / auth -----
function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) config = JSON.parse(raw);
  } catch {
    config = null;
  }
}

function saveConfig(c) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  config = c;
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
  config = null;
}

function openConfig() {
  if (config) {
    els.endpointInput.value = config.endpoint;
    els.tokenInput.value = config.token;
  } else {
    els.endpointInput.value = "https://telemetry.loopgain.ai";
    els.tokenInput.value = "";
  }
  els.configError.hidden = true;
  els.configDialog.showModal();
}

async function onConfigSubmit(ev) {
  ev.preventDefault();
  const endpoint = els.endpointInput.value.trim().replace(/\/$/, "");
  const token = els.tokenInput.value.trim();
  if (!endpoint || !token) {
    showConfigError("Endpoint and token are both required.");
    return;
  }

  setStatus("loading");
  // Validate by hitting /health and /v1/stats.
  try {
    const healthResp = await fetch(`${endpoint}/health`);
    if (!healthResp.ok) {
      showConfigError(`Endpoint health check failed (HTTP ${healthResp.status}).`);
      return;
    }
    const statsResp = await fetch(`${endpoint}/v1/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (statsResp.status === 401) {
      showConfigError("Invalid bearer token for that endpoint.");
      return;
    }
    if (!statsResp.ok) {
      showConfigError(`Stats endpoint returned HTTP ${statsResp.status}.`);
      return;
    }
  } catch (e) {
    showConfigError(`Cannot reach endpoint: ${e.message ?? e}`);
    return;
  }

  saveConfig({ endpoint, token });
  els.configDialog.close();
  showDashboard();
  refresh();
}

function showConfigError(msg) {
  els.configError.textContent = msg;
  els.configError.hidden = false;
  setStatus("disconnected");
}

// ----- View state -----
function showEmptyState() {
  els.emptyState.hidden = false;
  els.main.hidden = true;
}

function showDashboard() {
  els.emptyState.hidden = true;
  els.main.hidden = false;
}

function setStatus(state) {
  const map = {
    connected: { text: "connected", cls: "status-pill-connected" },
    disconnected: { text: "disconnected", cls: "status-pill-disconnected" },
    loading: { text: "loading…", cls: "status-pill-loading" },
  };
  const { text, cls } = map[state] ?? map.disconnected;
  els.connectionStatus.textContent = text;
  els.connectionStatus.className = `status-pill ${cls}`;
}

// ----- Data fetching -----
async function apiGet(path) {
  if (!config) throw new Error("Not configured");
  const resp = await fetch(`${config.endpoint}${path}`, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${path}`);
  }
  return resp.json();
}

async function refresh() {
  if (!config) return;
  setStatus("loading");
  try {
    const [stats, profiles, events] = await Promise.all([
      apiGet("/v1/stats"),
      apiGet("/v1/profiles"),
      apiGet("/v1/events"),
    ]);
    renderKpis(stats);
    populateWorkloadFilter(stats);
    renderHealthMap(events.events ?? []);
    renderConvergence(profiles.events ?? []);
    renderWasteReport(stats);
    updateFooter(stats);
    setStatus("connected");
  } catch (e) {
    setStatus("disconnected");
    console.error(e);
  }
}

async function refreshConvergence() {
  if (!config) return;
  const workloadId = els.workloadFilter.value;
  try {
    const path = workloadId
      ? `/v1/profiles?workload_id=${encodeURIComponent(workloadId)}`
      : "/v1/profiles";
    const profiles = await apiGet(path);
    renderConvergence(profiles.events ?? []);
  } catch (e) {
    console.error(e);
  }
}

// ----- Render: KPIs -----
function renderKpis(stats) {
  const totals = stats.totals ?? {};
  const eventCount = Number(totals.event_count ?? 0);
  const totalSavings = Number(totals.total_savings ?? 0);
  const rollbacks = Number(totals.rollbacks ?? 0);

  els.kpiLoops.textContent = eventCount.toLocaleString();
  els.kpiSavings.textContent = totalSavings.toLocaleString();
  els.kpiRollbacks.textContent = rollbacks.toLocaleString();

  const outcomes = stats.outcomes ?? [];
  if (outcomes.length === 0) {
    els.kpiOutcomes.textContent = "—";
  } else {
    els.kpiOutcomes.innerHTML = outcomes
      .map(
        (o) =>
          `<div><span style="color: ${outcomeColor(o.outcome)}">●</span> ` +
          `${o.outcome}: ${Number(o.count).toLocaleString()}</div>`
      )
      .join("");
  }
}

function outcomeColor(outcome) {
  switch (outcome) {
    case "converged":
      return "var(--ok)";
    case "oscillating":
      return "color-mix(in srgb, var(--danger) 60%, transparent)";
    case "diverged":
      return "var(--danger)";
    case "max_iterations":
      return "var(--neutral)";
    case "in_progress":
      return "var(--info)";
    default:
      return "var(--text-faint)";
  }
}

// ----- Render: workload filter -----
function populateWorkloadFilter(stats) {
  const workloads = stats.workloads ?? [];
  const current = els.workloadFilter.value;
  els.workloadFilter.innerHTML = `<option value="">All workloads</option>`;
  for (const w of workloads) {
    if (w.workload_id == null) continue;
    const opt = document.createElement("option");
    opt.value = w.workload_id;
    opt.textContent = `${w.workload_id} (${w.count})`;
    els.workloadFilter.appendChild(opt);
  }
  if (current && workloads.some((w) => w.workload_id === current)) {
    els.workloadFilter.value = current;
  }
}

// ----- Render: Loop Health Map -----
function renderHealthMap(events) {
  els.healthGrid.innerHTML = "";
  // Most recent last (so eye reads bottom-right = newest).
  const sorted = events.slice().reverse();
  for (const e of sorted) {
    const cell = document.createElement("div");
    cell.className = `health-cell health-cell-${healthClass(e)}`;
    cell.title =
      `${e.outcome} · ${e.iterations_used} iters` +
      (e.workload_id ? ` · ${e.workload_id}` : "") +
      ` · ${formatTimestamp(e.timestamp_hour)}`;
    els.healthGrid.appendChild(cell);
  }
  if (sorted.length === 0) {
    els.healthGrid.innerHTML =
      `<p style="color: var(--text-faint); grid-column: 1 / -1; padding: 12px 0; margin: 0;">` +
      `No events yet. Once your library calls send_telemetry(), loops appear here.</p>`;
  }
}

function healthClass(event) {
  switch (event.outcome) {
    case "converged":
      // If profile_max suggests stalling, mark amber even when converged.
      if (Number(event.profile_max ?? 0) >= 0.85) return "stalling";
      return "converged";
    case "oscillating":
      return "oscillating";
    case "diverged":
      return "diverged";
    case "max_iterations":
      return "max";
    default:
      return "max";
  }
}

// ----- Render: Convergence Profiles -----
function renderConvergence(events) {
  // Sort oldest-first for chart.
  const sorted = events.slice().sort((a, b) => a.timestamp_hour - b.timestamp_hour);
  const labels = sorted.map((e) => formatTimestamp(e.timestamp_hour));
  const medians = sorted.map((e) =>
    e.profile_median == null ? null : Number(e.profile_median)
  );
  const maxes = sorted.map((e) =>
    e.profile_max == null ? null : Number(e.profile_max)
  );

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Aβ median",
          data: medians,
          borderColor: "#6ea8fe",
          backgroundColor: "rgba(110, 168, 254, 0.15)",
          tension: 0.25,
          spanGaps: true,
        },
        {
          label: "Aβ max",
          data: maxes,
          borderColor: "rgba(248, 113, 113, 0.7)",
          backgroundColor: "rgba(248, 113, 113, 0.05)",
          borderDash: [6, 4],
          tension: 0.25,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: getCss("--text-dim") } },
        annotation: {},
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: {
          ticks: { color: getCss("--text-faint"), maxRotation: 0, autoSkip: true },
          grid: { color: getCss("--border") },
        },
        y: {
          ticks: { color: getCss("--text-faint") },
          grid: { color: getCss("--border") },
          suggestedMin: 0,
          suggestedMax: 1.2,
          title: { display: true, text: "Aβ smoothed", color: getCss("--text-dim") },
        },
      },
    },
  };

  if (convergenceChart) {
    convergenceChart.data = config.data;
    convergenceChart.options = config.options;
    convergenceChart.update();
  } else {
    convergenceChart = new Chart(els.convergenceCanvas, config);
  }
}

// ----- Render: Waste Report -----
function renderWasteReport(stats) {
  const totals = stats.totals ?? {};
  const eventCount = Number(totals.event_count ?? 0);
  const totalSavings = Number(totals.total_savings ?? 0);
  const costPerIter = Number(els.costInput.value || "0");
  const dollars = totalSavings * costPerIter;
  const perLoop = eventCount > 0 ? totalSavings / eventCount : 0;

  els.wasteIters.textContent = totalSavings.toLocaleString();
  els.wasteDollars.textContent = `$${dollars.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
  els.wastePerLoop.textContent = perLoop.toFixed(2);
}

function refreshWasteReport() {
  // Re-render using the last-loaded stats. We don't keep a copy, so just
  // re-pull /v1/stats — it's cheap (single aggregate query).
  if (!config) return;
  apiGet("/v1/stats")
    .then(renderWasteReport)
    .catch((e) => console.error(e));
}

// ----- Footer -----
function updateFooter(stats) {
  if (!config) return;
  els.endpointDisplay.textContent = config.endpoint;
  els.customerDisplay.textContent = stats.customer_id ?? "unknown";
}

// ----- Utilities -----
function formatTimestamp(unixSeconds) {
  if (unixSeconds == null) return "—";
  const d = new Date(Number(unixSeconds) * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCss(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
