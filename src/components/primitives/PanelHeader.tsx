import type { ReactNode } from "react";

interface Props {
  title: string;
  eyebrow?: string;
  right?: ReactNode;
}

export function PanelHeader({ title, eyebrow, right }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 18,
        gap: 12,
      }}
    >
      <div>
        {eyebrow && (
          <div className="label" style={{ marginBottom: 6 }}>
            {eyebrow}
          </div>
        )}
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
    </div>
  );
}
