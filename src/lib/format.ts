// Display formatters. No locale assumptions beyond `toLocaleString()`.

export function fmtUSD(v: number, opts: { cents?: boolean } = {}): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (abs >= 1000) return "$" + (v / 1000).toFixed(1) + "k";
  return "$" + v.toFixed(opts.cents === false ? 0 : 2);
}

export function fmtInt(v: number): string {
  return v.toLocaleString();
}

/** Compact integer formatter mirroring fmtUSD's k/M/B scaling. Use for
 *  unitless counts on prominent KPIs where a 9-digit comma-separated
 *  literal becomes unreadable at enterprise demo scale (e.g. 30M loop
 *  events/month). Sub-1000 values stay literal; thousands → "12.3k";
 *  millions → "1.4M"; billions → "2.5B". */
export function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return (v / 1_000).toFixed(1) + "k";
  return v.toLocaleString();
}

export function fmtPct(v: number, digits = 1): string {
  return (v * 100).toFixed(digits) + "%";
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtRel(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtAbsTs(unixSeconds: number): string {
  if (unixSeconds == null) return "—";
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtAbsTsExact(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
