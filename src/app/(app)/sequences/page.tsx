"use client";
import { useApi, useRange, type Meta } from "@/components/hooks";
import { Block } from "@/components/Block";
import { C, Empty, ErrorBox, Segmented, TableSkeleton } from "@/components/ui";
import { AttributionNote } from "@/components/Shell";
import { StatusLine } from "@/components/StatusLine";
import { money, n0, pct } from "@/lib/format";

type Step = { id: string; name: string; sub: string; sent: number; ctr: number | null; booked: number; show: number | null; sales: number; rev: number; share: number | null; top: boolean };
type Seq = { id: string; title: string; note: string; steps: Step[] };

const HEADS = ["Step", "Sent", "Click rate", "Booked calls", "Show rate", "Sales", "Revenue", "Share of revenue"];

export default function SequencesPage() {
  const [range, setRange] = useRange([30, 60, 90], 90);
  const q = useApi<{ data: Seq[]; meta: Meta }>(`/api/sequences?range=${range}`);
  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 14, color: "var(--body2)", lineHeight: 1.5, maxWidth: 760 }}>
          Which step in each automation actually earns the money. The highlighted row is the step doing the most work.
        </div>
        <Segmented label="Date range" size="sm" value={range} onChange={setRange} options={[30, 60, 90].map((r) => ({ value: r, label: `${r} days` }))} />
      </div>
      <StatusLine meta={q.data?.meta} />
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {q.loading && !q.data ? (
        <TableSkeleton rows={5} />
      ) : q.data && q.data.data.length === 0 ? (
        <div className="card-lg">
          <Empty>No sequence sends in this range. Sequence emails appear here once their links carry a step id in utm_content.</Empty>
        </div>
      ) : (
        q.data?.data.map((s) => (
          <Block
            key={s.id}
            title={s.title}
            note={s.note}
            heads={HEADS}
            rows={s.steps.map((x) => ({
              key: x.id,
              name: x.name,
              sub: x.sub,
              cells: [
                { v: n0(x.sent), num: x.sent },
                { v: pct(x.ctr), num: x.ctr },
                { v: String(x.booked), num: x.booked },
                { v: pct(x.show, 0), num: x.show },
                { v: String(x.sales), num: x.sales },
                { v: money(x.rev), num: x.rev, color: x.top ? C.green : C.ink, bold: x.top },
                { v: pct(x.share, 0), num: x.share, color: x.top ? C.green : C.ink, bold: x.top },
              ],
            }))}
          />
        ))
      )}
      {q.data && <AttributionNote windowDays={q.data.meta.settings.windowDays} model={q.data.meta.settings.model} />}
    </div>
  );
}
