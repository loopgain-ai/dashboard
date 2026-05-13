// Aggregation helpers: percentiles, histogram bucketing, simple groupBy.
// All operate on plain arrays; no dependency on the API layer.

export function sortedNumbers(arr: ReadonlyArray<number | null | undefined>): number[] {
  return arr.filter((v): v is number => typeof v === "number" && !Number.isNaN(v)).sort((a, b) => a - b);
}

/** Inclusive percentile (0..1) over a numeric array. Returns null if empty. */
export function percentile(arr: ReadonlyArray<number | null | undefined>, p: number): number | null {
  const xs = sortedNumbers(arr);
  if (xs.length === 0) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.floor(xs.length * p)));
  return xs[idx];
}

export function median(arr: ReadonlyArray<number | null | undefined>): number | null {
  return percentile(arr, 0.5);
}

export function mean(arr: ReadonlyArray<number | null | undefined>): number | null {
  const xs = sortedNumbers(arr);
  if (xs.length === 0) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

export interface Bucket {
  lo: number;
  hi: number;
  count: number;
  ids: string[];
}

/**
 * Bucket numeric values into evenly-spaced buckets and tag each bucket with
 * the list of ids that fell into it. Returns buckets in ascending order.
 */
export function histogram(
  rows: ReadonlyArray<{ value: number | null | undefined; id?: string | null }>,
  edges: ReadonlyArray<number>,
): Bucket[] {
  const buckets: Bucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    buckets.push({ lo: edges[i]!, hi: edges[i + 1]!, count: 0, ids: [] });
  }
  for (const r of rows) {
    if (typeof r.value !== "number" || Number.isNaN(r.value)) continue;
    for (const b of buckets) {
      if (r.value >= b.lo && r.value < b.hi) {
        b.count++;
        if (r.id) b.ids.push(r.id);
        break;
      }
    }
  }
  return buckets;
}

/** Evenly-spaced bucket edges between [lo, hi]. */
export function linEdges(lo: number, hi: number, count: number): number[] {
  const out: number[] = [];
  const step = (hi - lo) / count;
  for (let i = 0; i <= count; i++) out.push(lo + i * step);
  return out;
}

/** Group an array by a key function. */
export function groupBy<T, K extends string | number | symbol>(
  arr: ReadonlyArray<T>,
  key: (t: T) => K,
): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    const bucket = m.get(k);
    if (bucket) bucket.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Sum a numeric key (treating null/undefined/NaN as 0). */
export function sumBy<T>(arr: ReadonlyArray<T>, key: (t: T) => number | null | undefined): number {
  let s = 0;
  for (const x of arr) {
    const v = key(x);
    if (typeof v === "number" && !Number.isNaN(v)) s += v;
  }
  return s;
}
