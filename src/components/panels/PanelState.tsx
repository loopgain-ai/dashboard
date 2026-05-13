// Shared loading/error/empty wrappers so every panel handles boundaries
// the same way without duplicating chrome.

import type { ReactNode } from "react";
import type { LoadState } from "../../lib/api";

interface RenderProps<T> {
  state: LoadState<T>;
  loadingFallback?: ReactNode;
  emptyFallback?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T, isStale: boolean) => ReactNode;
}

export function Loaded<T>({
  state,
  loadingFallback,
  emptyFallback,
  isEmpty,
  children,
}: RenderProps<T>) {
  if (state.status === "idle") {
    return <NotConnected />;
  }
  if (state.status === "loading") {
    if (state.previous) return <>{children(state.previous, true)}</>;
    return <>{loadingFallback ?? <LoadingSpinner />}</>;
  }
  if (state.status === "error") {
    return <ErrorMessage error={state.error} />;
  }
  if (isEmpty && isEmpty(state.data)) {
    return <>{emptyFallback ?? <EmptyHint />}</>;
  }
  return <>{children(state.data, false)}</>;
}

export function LoadingSpinner({ label = "loading" }: { label?: string }) {
  return (
    <div
      style={{
        padding: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-3)",
        fontSize: 12,
        fontFamily: "var(--mono)",
        gap: 10,
      }}
    >
      <span
        className="spin"
        style={{
          display: "inline-block",
          width: 12,
          height: 12,
          border: "1.5px solid var(--border-2)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
        }}
      />
      {label}
    </div>
  );
}

export function ErrorMessage({ error }: { error: Error }) {
  return (
    <div
      style={{
        margin: 24,
        padding: 16,
        borderRadius: 8,
        border: "1px solid color-mix(in oklab, var(--band-osc) 35%, transparent)",
        background: "color-mix(in oklab, var(--band-osc) 8%, transparent)",
        color: "var(--band-osc)",
        fontFamily: "var(--mono)",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Failed to load.</div>
      <div style={{ color: "var(--text-2)" }}>{error.message}</div>
    </div>
  );
}

export function EmptyHint({
  title = "No telemetry yet.",
  body = "Once your library calls send_telemetry(), loops appear here.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div
      style={{
        margin: 24,
        padding: 24,
        textAlign: "center",
        color: "var(--text-3)",
        fontSize: 12,
        border: "1px dashed var(--border-2)",
        borderRadius: 8,
        background: "var(--surf-1)",
      }}
    >
      <div style={{ color: "var(--text-1)", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
        {title}
      </div>
      {body}
    </div>
  );
}

export function NotConnected() {
  return (
    <div
      style={{
        margin: 24,
        padding: 24,
        textAlign: "center",
        color: "var(--text-3)",
        fontSize: 12,
        border: "1px dashed var(--border-2)",
        borderRadius: 8,
        background: "var(--surf-1)",
      }}
    >
      Not connected. Use the env switcher (top-left) to paste your endpoint and token.
    </div>
  );
}
