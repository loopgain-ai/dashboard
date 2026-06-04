// Aggregation helpers: percentiles, histogram bucketing, simple groupBy.
// All operate on plain arrays; no dependency on the API layer.

export function sortedNumbers(arr: ReadonlyArray<number | null | undefined>): number[] {
  return arr.filter((v): v is number => typeof v === "number" && !Number.isNaN(v)).sort((a, b) => a - b);
}

/**
 * Linear-interpolated percentile (0..1) over a numeric array. Returns null if
 * empty. Uses the standard "type 7" definition (rank = (n-1)·p), so
 * percentile([1,2,3,4], 0.5) === 2.5, matching the conventional median rather
 * than biasing toward the upper-middle element.
 */
export function percentile(arr: ReadonlyArray<number | null | undefined>, p: number): number | null {
  const xs = sortedNumbers(arr);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0]!;
  const clampedP = Math.min(1, Math.max(0, p));
  const rank = (xs.length - 1) * clampedP;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return xs[lo]!;
  return xs[lo]! + (xs[hi]! - xs[lo]!) * (rank - lo);
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
  const lastIdx = buckets.length - 1;
  for (const r of rows) {
    if (typeof r.value !== "number" || !Number.isFinite(r.value)) continue;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]!;
      // Half-open [lo, hi) buckets, except the final bucket is closed [lo, hi]
      // so a value exactly equal to the top edge is counted rather than
      // silently dropped. Values strictly above the top edge are still out of
      // range by construction — callers that may exceed `hi` must supply an
      // overflow bucket (see GainMargin panel).
      const inBucket = i === lastIdx ? r.value >= b.lo && r.value <= b.hi : r.value >= b.lo && r.value < b.hi;
      if (inBucket) {
        b.count++;
        if (r.id) b.ids.push(r.id);
        break;
      }
    }
  }
  return buckets;
}

/** Evenly-spaced bucket edges between [lo, hi]. Returns [] for count <= 0. */
export function linEdges(lo: number, hi: number, count: number): number[] {
  if (!Number.isFinite(count) || count <= 0) return [];
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
