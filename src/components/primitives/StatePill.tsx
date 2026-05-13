import type { CSSProperties } from "react";
import type { Band } from "../../types";
import { BAND_BY_ID } from "../../lib/bands";

interface Props {
  band: Band;
  label?: string;
  size?: "sm" | "lg";
}

export function StatePill({ band, label, size = "sm" }: Props) {
  const b = BAND_BY_ID[band];
  const style: CSSProperties =
    size === "lg" ? { height: 26, padding: "0 12px", fontSize: 11.5 } : {};
  return (
    <span className={`pill pill-${b.cls}`} style={style}>
      <span className={`dot dot-${b.cls}`} />
      <span>{(label ?? b.label).toUpperCase()}</span>
    </span>
  );
}
