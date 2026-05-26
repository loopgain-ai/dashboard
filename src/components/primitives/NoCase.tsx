import type { ReactNode } from "react";

// The site-wide `.label` class applies `text-transform: uppercase`.
// `"β".toUpperCase()` returns the Greek capital beta U+0392, which
// renders as "B" in most fonts — so any "Aβ" inside a KPI/eyebrow
// label silently shows as "AB". Wrap the lowercase characters that
// must stay lowercase in <NoCase>...</NoCase> to opt that span back
// out of the uppercase transform.
export function NoCase({ children }: { children: ReactNode }) {
  return <span style={{ textTransform: "none" }}>{children}</span>;
}
