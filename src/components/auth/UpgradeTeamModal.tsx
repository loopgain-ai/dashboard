// Team-upgrade surfaces, shared by every Team-gated feature.
//
// Two shapes:
//   <UpgradeTeamModal>  — dialog shown when an Individual-tier user tries
//                         a gated ACTION (alert writes). The receiver
//                         enforces the same gate with 403
//                         team_tier_required; this is the friendly face.
//   <TeamGateCard>      — full-panel gate for a Team-only VIEW (Waste
//                         Report). Sells what's behind it instead of
//                         rendering a dead screen.
//
// Copy is per-feature so the pitch names what the user actually reached
// for. Pricing: $199/mo per workspace (landing #pricing is canonical).

import { useEffect, useRef } from "react";

export type TeamFeature = "alerts" | "waste";

const FEATURE_COPY: Record<
  TeamFeature,
  { title: string; body: string }
> = {
  alerts: {
    title: "Alerts are part of the Team tier",
    body:
      "Get paged in Slack, email, or any webhook the moment a loop " +
      "diverges or rollbacks spike — with per-workload filters, cooldowns, " +
      "and a delivery audit trail.",
  },
  waste: {
    title: "The Waste Report is part of the Team tier",
    body:
      "The fleet-wide dollar ROI view for stakeholders: measured savings " +
      "vs. the would-have-spent counterfactual, iterations-past-best " +
      "economics, and per-workload / per-outcome breakdowns.",
  },
};

function PriceLine() {
  return (
    <>
      Team is <span style={{ color: "var(--text-1)" }}>$199/mo per workspace</span> and
      covers your whole team&apos;s loops.
    </>
  );
}

function UpgradeButton() {
  return (
    <a
      href="https://loopgain.ai/#pricing"
      target="_blank"
      rel="noreferrer"
      style={{
        background: "var(--accent)",
        color: "var(--bg-0)",
        border: "1px solid var(--accent)",
        borderRadius: 5,
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        textDecoration: "none",
      }}
    >
      Upgrade to Team
    </a>
  );
}

function TeamChip() {
  return (
    <div
      className="mono"
      style={{
        display: "inline-block",
        fontSize: 10,
        padding: "3px 8px",
        borderRadius: 3,
        background: "color-mix(in oklab, var(--accent) 14%, transparent)",
        color: "var(--accent)",
        letterSpacing: "0.05em",
        marginBottom: 10,
      }}
    >
      TEAM FEATURE
    </div>
  );
}

export function UpgradeTeamModal({
  open,
  onClose,
  feature = "alerts",
}: {
  open: boolean;
  onClose: () => void;
  feature?: TeamFeature;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const copy = FEATURE_COPY[feature];
  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop closes (the dialog element itself is the
        // target only when the click lands outside the inner card).
        if (e.target === dialogRef.current) onClose();
      }}
      style={{
        background: "var(--surf-1)",
        border: "1px solid var(--border-2)",
        borderRadius: 12,
        padding: 0,
        maxWidth: 440,
        width: "calc(100vw - 48px)",
        color: "var(--text-1)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ padding: "22px 24px 8px" }}>
        <TeamChip />
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>{copy.title}</h2>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--text-2)" }}>
          {copy.body} <PriceLine />
        </p>
        {feature === "alerts" && (
          <p style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "var(--text-3)" }}>
            Your existing rules keep evaluating and can still be deleted —
            creating, editing, and testing rules is what upgrades unlock.
          </p>
        )}
      </div>
      <div
        style={{
          padding: "16px 24px 20px",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            color: "var(--text-2)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            padding: "6px 14px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Not now
        </button>
        <UpgradeButton />
      </div>
    </dialog>
  );
}

/** Full-panel gate for Team-only views (Waste Report on Individual
 *  tier). The demo and the /benchmark view never gate — the demo
 *  deliberately shows every Team feature (its banner says so). */
export function TeamGateCard({ feature }: { feature: TeamFeature }) {
  const copy = FEATURE_COPY[feature];
  return (
    <div
      className="card"
      style={{
        maxWidth: 560,
        margin: "48px auto",
        padding: "28px 32px",
        textAlign: "left",
      }}
    >
      <TeamChip />
      <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 600 }}>{copy.title}</h2>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--text-2)" }}>
        {copy.body} <PriceLine />
      </p>
      <p style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "var(--text-3)" }}>
        Want to see it in action first? The{" "}
        <a href="/demo" style={{ color: "var(--accent)", textDecoration: "underline" }}>
          live demo
        </a>{" "}
        includes every Team-tier feature, replaying the recorded public benchmark.
      </p>
      <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
        <UpgradeButton />
      </div>
    </div>
  );
}
