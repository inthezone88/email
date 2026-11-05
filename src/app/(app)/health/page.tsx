"use client";
import { useApi, useRange, type Meta } from "@/components/hooks";
import { Block } from "@/components/Block";
import { C, Empty, ErrorBox, Segmented, TableSkeleton } from "@/components/ui";
import { StatusLine } from "@/components/StatusLine";
import { LIMITS, shortDate } from "@/lib/metrics";
import { n0, pct } from "@/lib/format";

type Row = { id: string; name: string; sentAt: string; sent: number; bounce: number; spam: number; unsub: number; status: "Act now" | "Watch" | "Healthy" };
const HEADS = ["Campaign", "Sent", "Bounce rate", "Spam complaints", "Unsubscribes", "Status"];

export default function HealthPage() {
  const [range, setRange] = useRange([30, 60, 90], 90);
  const q = useApi<{ data: Row[]; meta: Meta }>(`/api/health?range=${range}`);
  const rows = q.data?.data ?? [];
  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 14, color: "var(--body2)", lineHeight: 1.5, maxWidth: 760 }}>Deliverability problems quietly hurt every future send. Fix red rows first.</div>
        <Segmented label="Date range" size="sm" value={range} onChange={setRange} options={[30, 60, 90].map((r) => ({ value: r, label: `${r} days` }))} />
      </div>
      <StatusLine meta={q.data?.meta} />
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {q.loading && !q.data ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="card-lg">
          <Empty>No sends in this range.</Empty>
        </div>
      ) : (
        <Block
          title="Deliverability by send"
          note="Limits: bounce under 2%, spam complaints under 0.10%, unsubscribes under 0.5%."
          heads={HEADS}
          rows={rows.map((x) => ({
            key: x.id,
            name: x.name,
            sub: shortDate(x.sentAt),
            cells: [
              { v: n0(x.sent), num: x.sent },
              { v: pct(x.bounce), num: x.bounce, color: x.bounce > LIMITS.bounceRed ? C.red : C.ink },
              { v: pct(x.spam, 2), num: x.spam, color: x.spam > LIMITS.spamRed ? C.red : x.spam > LIMITS.spamWatch ? C.amber : C.ink },
              { v: pct(x.unsub), num: x.unsub, color: x.unsub > LIMITS.unsubWatch ? C.amber : C.ink },
              { v: x.status, num: 0, bold: true, color: x.status === "Act now" ? C.red : x.status === "Watch" ? C.amber : C.green },
            ],
          }))}
        />
      )}
    </div>
  );
}
