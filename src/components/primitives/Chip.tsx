import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

interface Props {
  children: ReactNode;
  on?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  icon?: ReactNode;
  kbd?: string;
  title?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Chip({ children, on, onClick, icon, kbd, title, disabled, style }: Props) {
  return (
    <button
      type="button"
      className={`chip${on ? " on" : ""}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={style}
    >
      {icon}
      <span>{children}</span>
      {kbd ? (
        <span className="kbd" style={{ marginLeft: 4 }}>
          {kbd}
        </span>
      ) : null}
    </button>
  );
}
