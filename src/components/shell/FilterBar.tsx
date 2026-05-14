// Cross-panel classification filter bar (schema v3).
//
// Renders three dropdowns for framework / loop_type / team plus a clear
// button. Reads distinct values from useStats(), writes selections to the
// FilterContext. Filters are applied server-side by every panel hook that
// honors them (useProfiles, useEvents, useCalibration).

import { useFilters } from "../../lib/filters";
import { useStats } from "../../lib/data-hooks";
import type { FilterSet } from "../../types";

interface DropdownProps {
  label: string;
  field: keyof FilterSet;
  options: ReadonlyArray<{ value: string; count: number }>;
}

function Dropdown({ label, field, options }: DropdownProps) {
  const { filters, setFilter } = useFilters();
  const value = filters[field] ?? "";
  const isActive = Boolean(value);
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "var(--text-3)",
        fontFamily: "var(--mono)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => setFilter(field, e.target.value || undefined)}
        title={`Filter by ${label.toLowerCase()}`}
        style={{
          height: 24,
          padding: "0 22px 0 8px",
          fontSize: 11.5,
          fontFamily: "var(--mono)",
          textTransform: "none",
          letterSpacing: "normal",
          color: isActive ? "var(--accent)" : "var(--text-2)",
          background: isActive
            ? "color-mix(in oklab, var(--accent) 12%, var(--surf-1))"
            : "var(--surf-1)",
          border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 4,
          cursor: "pointer",
          minWidth: 90,
        }}
      >
        <option value="">all</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value} ({o.count})
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar() {
  const { filters, clear, active } = useFilters();
  const stats = useStats();
  const data =
    stats.state.status === "ok"
      ? stats.state.data
      : stats.state.status === "loading" && stats.state.previous
      ? stats.state.previous
      : null;
  const frameworks = data?.frameworks ?? [];
  const loopTypes = data?.loop_types ?? [];
  const teams = data?.teams ?? [];
  const workloads = data?.workloads ?? [];

  // Don't render the bar if the receiver is on schema v2 (no distinct
  // values for any classification field, no workloads to filter by).
  if (
    frameworks.length === 0 &&
    loopTypes.length === 0 &&
    teams.length === 0 &&
    workloads.length === 0
  ) {
    return null;
  }

  const activeFiltersList = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`);

  return (
    <div
      style={{
        height: 36,
        flex: "0 0 auto",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-1)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 14px",
        overflowX: "auto",
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          color: "var(--text-4)",
          fontFamily: "var(--mono)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        filter
      </span>
      {frameworks.length > 0 && (
        <Dropdown label="framework" field="framework" options={frameworks} />
      )}
      {loopTypes.length > 0 && (
        <Dropdown label="loop type" field="loop_type" options={loopTypes} />
      )}
      {teams.length > 0 && (
        <Dropdown label="team" field="team" options={teams} />
      )}
      {workloads.length > 0 && (
        <Dropdown
          label="workload"
          field="workload_id"
          options={workloads
            .filter((w) => w.workload_id != null)
            .map((w) => ({ value: w.workload_id as string, count: w.count }))}
        />
      )}
      <span style={{ flex: 1 }} />
      {active && (
        <button
          type="button"
          onClick={clear}
          title={`Clear ${activeFiltersList.length} active filter${activeFiltersList.length === 1 ? "" : "s"}`}
          style={{
            height: 24,
            padding: "0 10px",
            fontSize: 11,
            color: "var(--accent)",
            background: "transparent",
            border: "1px solid var(--accent)",
            borderRadius: 4,
            cursor: "pointer",
            fontFamily: "var(--mono)",
          }}
        >
          clear ({activeFiltersList.length})
        </button>
      )}
    </div>
  );
}
