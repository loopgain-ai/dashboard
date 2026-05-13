import type { ReactNode } from "react";

interface Props {
  x: number | null;
  y: number;
  children: ReactNode;
}

export function Tooltip({ x, y, children }: Props) {
  if (x == null) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        pointerEvents: "none",
        transform: "translate(8px, -110%)",
        background: "var(--surf-3)",
        border: "1px solid var(--border-2)",
        borderRadius: 6,
        padding: "7px 9px",
        fontSize: 11,
        whiteSpace: "nowrap",
        color: "var(--text-1)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
        fontFamily: "var(--mono)",
        zIndex: 50,
      }}
    >
      {children}
    </div>
  );
}
