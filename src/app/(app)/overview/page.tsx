"use client";
import { useApi, useRange, type Meta } from "@/components/hooks";
import { ErrorBox, Segmented, Skeleton } from "@/components/ui";
import { AttributionNote } from "@/components/Shell";
import { StatusLine } from "@/components/StatusLine";
import { money } from "@/lib/format";

type Overview = { totals: { sent: number; clicks: number; booked: number; sales: number; rev: number }; bars: number[] };

const pct1 = (n: number) => (isFinite(n) ? (n * 100).toFixed(1) + "%" : "—");

export default function OverviewPage() {
  const [range, setRange] = useRange([7, 30, 90], 30, "er.mrange");
  const q = useApi<{ data: Overview; meta: Meta }>(`/api/overview?range=${range}`);
  const T = q.data?.data.totals;
  const funnelRaw: [string, number][] = T ? [["Sent", T.sent], ["Clicked", T.clicks], ["Booked a call", T.booked], ["Bought", T.sales]] : [];
  // Prototype scaling: later steps are magnified 8x so they're visible next to "Sent".
  const funnel = funnelRaw.map(([label, v], i) => ({
    label,
    value: v.toLocaleString("en-US"),
    rate: i ? pct1(v / funnelRaw[i - 1][1]) : "",
    w: Math.min(100, Math.max(2, (T!.sent ? v / T!.sent : 0) * 100 * (i ? 8 : 1))) + "%",
  }));
  const bars = q.data?.data.bars ?? [];
  const maxBar = Math.max(...bars, 1e-9);

  return (
    <div className="page" style={{ paddingTop: 8 }}>
      <Segmented label="Date range" fill value={range} onChange={setRange} options={[7, 30, 90].map((r) => ({ value: r, label: `${r} days` }))} />
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}

      <div style={{ background: "#1b1a17", color: "#f4f2ee", borderRadius: 20, padding: 22 }}>
        <div style={{ fontSize: 13, color: "#c9c5ba" }}>Revenue from emails</div>
        <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-.03em", margin: "4px 0 14px" }}>{T ? money(T.rev) : <Skeleton h={52} w={180} style={{ opacity: 0.25 }} />}</div>
        <div style={{ display: "flex", gap: 10 }}>
          {(
            [
              ["Booked calls", T?.booked],
              ["Sales", T?.sales],
              ["Per email", T ? "$" + (T.sent ? T.rev / T.sent : 0).toFixed(2) : undefined],
            ] as [string, number | string | undefined][]
          ).map(([l, v]) => (
            <div key={l} style={{ flex: 1, borderTop: "1px solid #4a473f", paddingTop: 10 }}>
              <div style={{ fontSize: 12, color: "#c9c5ba" }}>{l}</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{v ?? "–"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-lg">
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Funnel</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!T
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={30} />)
            : funnel.map((f) => (
                <div key={f.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 5 }}>
                    <span>{f.label}</span>
                    <span className="mono">
                      {f.value} <span style={{ color: "var(--muted)" }}>{f.rate}</span>
                    </span>
                  </div>
                  <div className="hbar">
                    <div style={{ width: f.w }} />
                  </div>
                </div>
              ))}
        </div>
      </div>

      <div className="card-lg">
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Revenue by day</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 96 }} role="img" aria-label={`Revenue by day over the last ${range} days`}>
          {bars.map((b, i) => (
            <div key={i} title={money(b)} style={{ flex: 1, borderRadius: "3px 3px 0 0", background: "#2f6f4f", height: b > 0 ? `${Math.max(4, (b / maxBar) * 100)}%` : 2, opacity: b > 0 ? 1 : 0.25 }} />
          ))}
        </div>
      </div>

      <StatusLine meta={q.data?.meta} />
      {q.data && <AttributionNote mobile windowDays={q.data.meta.settings.windowDays} model={q.data.meta.settings.model} />}
    </div>
  );
}
