// Workload filter row that survives high cardinality. Up to a dozen
// workloads it's the familiar chip row; past that a search input filters
// the chips (bench-style per-run IDs produced an unusable wall of
// near-identical chips on Health Map / Convergence).

import { useMemo, useState } from "react";
import { Chip } from "./Chip";

const CHIP_LIMIT = 12;

export function WorkloadFilter({
  workloads,
  selected,
  onSelect,
}: {
  workloads: ReadonlyArray<{ workload_id: string | null; count: number }>;
  selected: string | null;
  onSelect: (workloadId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const named = useMemo(
    () =>
      workloads.filter(
        (w): w is { workload_id: string; count: number } => Boolean(w.workload_id),
      ),
    [workloads],
  );
  const needsSearch = named.length > CHIP_LIMIT;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? named.filter((w) => w.workload_id.toLowerCase().includes(q))
      : named;
    return pool.slice(0, CHIP_LIMIT);
  }, [named, query]);
  const hidden = (query.trim() ? shown.length < CHIP_LIMIT ? 0 : named.length : named.length) - shown.length;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
      <span className="label" style={{ alignSelf: "center", marginRight: 6 }}>
        Workload
      </span>
      <Chip on={selected === null} onClick={() => onSelect(null)}>
        all
      </Chip>
      {/* Keep the active selection visible even when the query hides it. */}
      {selected && !shown.some((w) => w.workload_id === selected) && (
        <Chip on onClick={() => onSelect(null)}>
          {selected} ×
        </Chip>
      )}
      {shown.map((w) => (
        <Chip
          key={w.workload_id}
          on={selected === w.workload_id}
          onClick={() => onSelect(selected === w.workload_id ? null : w.workload_id)}
        >
          {w.workload_id} ({w.count})
        </Chip>
      ))}
      {needsSearch && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`search ${named.length} workloads…`}
          className="mono"
          style={{
            height: 26,
            padding: "0 10px",
            fontSize: 11,
            background: "var(--surf-2)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            color: "var(--text-1)",
            outline: "none",
            minWidth: 180,
          }}
        />
      )}
      {needsSearch && hidden > 0 && (
        <span
          className="mono"
          style={{ alignSelf: "center", fontSize: 10.5, color: "var(--text-3)" }}
        >
          +{hidden} more — type to filter
        </span>
      )}
    </div>
  );
}
