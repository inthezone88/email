"use client";
import { relTime } from "@/lib/format";
import type { Meta } from "./hooks";

/** "Last synced" + re-attribution spinner + sync error. */
export function StatusLine({ meta }: { meta?: Meta | null }) {
  if (!meta || (meta.location.status === "demo" && !meta.settings.reattributing)) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", fontSize: 12, color: "var(--muted)" }} aria-live="polite">
      {meta.settings.reattributing && (
        <span>
          <span className="spin" /> Re-crediting conversions with your new attribution settings…
        </span>
      )}
      {meta.syncError && <span style={{ color: "var(--red)" }}>Sync problem: {meta.syncError}</span>}
      <span className="mono">{meta.location.status === "demo" ? "Demo data" : `Last synced ${relTime(meta.lastSyncedAt)}`}</span>
    </div>
  );
}
