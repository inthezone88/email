"use client";
import { useState } from "react";
import { useApi, useRange, type Meta } from "@/components/hooks";
import { Block } from "@/components/Block";
import { C, Empty, ErrorBox, Segmented, TableSkeleton } from "@/components/ui";
import { AttributionNote } from "@/components/Shell";
import { StatusLine } from "@/components/StatusLine";
import { money, n0, pct } from "@/lib/format";

type Row = { name: string; sub: string; contacts: number; ctr: number | null; booked: number; show: number | null; rev: number; rpe: number | null };
const DIMS = [
  { value: "list", label: "List / tag" },
  { value: "source", label: "Lead source" },
  { value: "sender", label: "Sender" },
] as const;
type Dim = (typeof DIMS)[number]["value"];
const HEADS = ["Segment", "Contacts", "Click rate", "Booked calls", "Show rate", "Revenue", "Rev / 1k sent"];

export default function SegmentsPage() {
  const [range, setRange] = useRange([30, 60, 90], 90);
  const [dim, setDim] = useState<Dim>("list");
  const q = useApi<{ data: Row[]; meta: Meta }>(`/api/segments?dim=${dim}&range=${range}`);
  const rows = q.data?.data ?? [];
  const top = Math.max(...rows.map((r) => r.rpe ?? 0));
  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <Segmented label="Segment by" value={dim} onChange={setDim} options={DIMS.map((d) => ({ value: d.value, label: d.label }))} style={{ alignSelf: "flex-start" }} />
        <Segmented label="Date range" size="sm" value={range} onChange={setRange} options={[30, 60, 90].map((r) => ({ value: r, label: `${r} days` }))} />
      </div>
      <div style={{ fontSize: 14, color: "var(--body2)", lineHeight: 1.5, maxWidth: 760 }}>The same emails perform very differently depending on who gets them.</div>
      <StatusLine meta={q.data?.meta} />
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {q.loading && !q.data ? (
        <TableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <div className="card-lg">
          <Empty>No sends in this range.</Empty>
        </div>
      ) : (
        <Block
          title={DIMS.find((d) => d.value === dim)!.label}
          note="Revenue per 1,000 sent is the fairest way to compare segments of different sizes."
          heads={HEADS}
          rows={rows.map((x) => {
            const best = x.rpe !== null && x.rpe === top && top > 0;
            return {
              key: x.name,
              name: x.name,
              sub: x.sub,
              cells: [
                { v: n0(x.contacts), num: x.contacts },
                { v: pct(x.ctr), num: x.ctr },
                { v: String(x.booked), num: x.booked },
                { v: pct(x.show, 0), num: x.show },
                { v: money(x.rev), num: x.rev },
                { v: x.rpe === null ? "—" : money(x.rpe), num: x.rpe, color: best ? C.green : C.ink, bold: best },
              ],
            };
          })}
        />
      )}
      {q.data && <AttributionNote windowDays={q.data.meta.settings.windowDays} model={q.data.meta.settings.model} />}
    </div>
  );
}
