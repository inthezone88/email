"use client";
import { useState } from "react";
import { useApi, useRange, type Meta } from "@/components/hooks";
import { Empty, ErrorBox, Segmented, Skeleton } from "@/components/ui";
import { shortDate } from "@/lib/metrics";
import { money } from "@/lib/format";

type Email = { id: string; name: string; sentAt: string; sent: number; clicks: number; booked: number; sales: number; rev: number; bounce: number; unsub: number; utm: string | null };
const pct1 = (n: number) => (n * 100).toFixed(1) + "%";

export default function EmailsPage() {
  const [range] = useRange([7, 30, 90], 30, "er.mrange");
  const q = useApi<{ data: { emails: Email[] }; meta: Meta }>(`/api/overview?range=${range}`);
  const [sort, setSort] = useState<"revenue" | "booked" | "new">("revenue");
  const [open, setOpen] = useState<string | null>(null);
  const emails = (q.data?.data.emails ?? [])
    .slice()
    .sort((a, b) => (sort === "revenue" ? b.rev - a.rev : sort === "booked" ? b.booked - a.booked : b.sentAt.localeCompare(a.sentAt)));

  return (
    <div className="page" style={{ paddingTop: 8 }}>
      <Segmented
        label="Sort emails by"
        fill
        value={sort}
        onChange={setSort}
        options={[
          { value: "revenue", label: "Revenue" },
          { value: "booked", label: "Calls" },
          { value: "new", label: "Newest" },
        ]}
      />
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {q.loading && !q.data && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={76} style={{ borderRadius: 16 }} />)}
      {q.data && emails.length === 0 && (
        <div className="card-lg">
          <Empty>No sends in this range.</Empty>
        </div>
      )}
      {emails.map((e) => {
        const isOpen = open === e.id;
        return (
          <div key={e.id} style={{ background: "#fbfaf7", border: "1px solid #e1ded6", borderRadius: 16, overflow: "hidden" }}>
            <button
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : e.id)}
              style={{ width: "100%", minHeight: 44, textAlign: "left", border: 0, background: "transparent", padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{e.name}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                  {e.sent.toLocaleString("en-US")} sent · {shortDate(e.sentAt)}
                </div>
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#2f6f4f" }}>{money(e.rev)}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {e.booked} calls · {e.sales} sales
                </div>
              </div>
            </button>
            {isOpen && (
              <div style={{ borderTop: "1px solid #e1ded6", padding: "14px 18px", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                <Stat l="Click rate" v={e.sent ? pct1(e.clicks / e.sent) : "—"} />
                <Stat l="Click→call" v={pct1(e.booked / (e.clicks || 1))} />
                <Stat l="Rev / click" v={money(e.rev / (e.clicks || 1))} />
                <Stat l="Bounced" v={pct1(e.bounce)} />
                <Stat l="Unsub" v={pct1(e.unsub)} />
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Tracked link</div>
                  <div className="mono" style={{ fontSize: 11, marginTop: 4, wordBreak: "break-all" }}>
                    {e.utm ? `utm_campaign=${e.utm}` : "Not tagged"}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{l}</div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{v}</div>
    </div>
  );
}
