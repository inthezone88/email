"use client";
import { useMemo, useState } from "react";
import { C, Empty, ErrorBox, NumCell, Segmented, Skeleton, TableSkeleton } from "@/components/ui";
import { useApi, useRange, type Meta } from "@/components/hooks";
import { AttributionNote } from "@/components/Shell";
import { StatusLine } from "@/components/StatusLine";
import { barWidth, filterAndSort, PRESETS, type CampaignRow, type SortKey, type StyleGroup, type Totals, type WinnerLoser } from "@/lib/metrics";
import { money, n0, pct } from "@/lib/format";

type Summary = {
  totals: Totals;
  unattributed: { appointments: number; payments: number; revCents: number; total: number };
  winners: WinnerLoser[];
  styles: StyleGroup[];
  alerts: { severity: "red" | "amber" | "green"; text: string }[];
};

const COLS: { key: SortKey; label: string; fmt: (v: number) => string }[] = [
  { key: "sent", label: "Sent", fmt: n0 },
  { key: "opens", label: "Opens", fmt: n0 },
  { key: "clicks", label: "Clicks", fmt: n0 },
  { key: "ctor", label: "Click-to-open", fmt: (v) => pct(v) },
  { key: "ctr", label: "Click rate", fmt: (v) => pct(v) },
  { key: "booked", label: "Booked calls", fmt: (v) => String(v) },
  { key: "show", label: "Show rate", fmt: (v) => pct(v, 0) },
  { key: "close", label: "Close rate", fmt: (v) => pct(v, 0) },
  { key: "days", label: "Days to book", fmt: (v) => v.toFixed(1) + "d" },
  { key: "sales", label: "Sales", fmt: (v) => String(v) },
  { key: "rev", label: "Revenue", fmt: money },
  { key: "rpe", label: "Rev / 1k sent", fmt: money },
];
const GRID = "minmax(220px,2.2fr) repeat(12,minmax(80px,1fr))";
const SEV = { red: C.red, amber: C.amber, green: C.green };

export default function CampaignsPage() {
  const [range, setRange] = useRange([30, 60, 90], 90);
  const rowsQ = useApi<{ data: CampaignRow[]; meta: Meta }>(`/api/campaigns?range=${range}`);
  const sumQ = useApi<{ data: Summary; meta: Meta }>(`/api/summary?range=${range}`);
  const [sort, setSort] = useState<SortKey>("rev");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [preset, setPreset] = useState("revenue");
  const [search, setSearch] = useState("");

  const all = useMemo(() => rowsQ.data?.data ?? [], [rowsQ.data]);
  const rows = useMemo(() => filterAndSort(all, { search, preset, sort, dir }), [all, search, preset, sort, dir]);
  const mx = useMemo(() => {
    const m: Partial<Record<SortKey, number>> = {};
    for (const c of COLS) m[c.key] = Math.max(...all.map((x) => (typeof x[c.key] === "number" && isFinite(x[c.key] as number) ? (x[c.key] as number) : 0)), 1e-9);
    return m;
  }, [all]);

  const cur = PRESETS.find((p) => p.id === preset);
  const pickPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setSort(p.sort);
    setDir(p.dir);
  };
  const pickCol = (key: SortKey) => {
    if (sort === key) {
      setDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSort(key);
      setDir(-1);
    }
    setPreset("custom");
  };

  const s = sumQ.data?.data;
  const meta = rowsQ.data?.meta ?? sumQ.data?.meta;
  const err = rowsQ.error ?? sumQ.error;

  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <StatusLine meta={meta} />
      {err && <ErrorBox error={err} onRetry={() => (rowsQ.reload(), sumQ.reload())} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="card-title">Needs attention</div>
          {!s ? (
            <>
              <Skeleton h={18} />
              <Skeleton h={18} />
              <Skeleton h={18} w="70%" />
            </>
          ) : s.alerts.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing needs attention. Alerts appear here after each sync.</div>
          ) : (
            s.alerts.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.45 }}>
                <span className="dot" style={{ marginTop: 5, background: SEV[a.severity] }} />
                <span>
                  <span className="sr-only">{a.severity === "red" ? "Urgent: " : a.severity === "amber" ? "Warning: " : "Good news: "}</span>
                  {a.text}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="card-title">This period: winners and losers</div>
          {!s ? (
            <>
              <Skeleton h={34} />
              <Skeleton h={34} />
            </>
          ) : s.winners.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No sends in this range.</div>
          ) : (
            s.winners.map((w) => (
              <div key={w.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, lineHeight: 1.45 }}>
                <span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>
                    {w.k}
                  </span>
                  <br />
                  {w.name}
                </span>
                <span style={{ fontWeight: 600, color: w.tone === "good" ? C.green : C.red, textAlign: "right", whiteSpace: "nowrap" }}>
                  {w.format === "money" ? money(w.value) : pct(w.value)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="kpis">
        {(
          [
            ["Sent", s ? n0(s.totals.sent) : null],
            ["Opens", s ? n0(s.totals.opens) : null],
            ["Clicks", s ? n0(s.totals.clicks) : null],
            ["Booked calls", s ? String(s.totals.booked) : null],
            ["Sales", s ? String(s.totals.sales) : null],
            ["Unattributed", s ? String(s.unattributed.total) : null, "Bookings and payments with no email click inside the window. A high number means links are missing tracking."],
            ["Revenue", s ? money(s.totals.rev) : null],
          ] as [string, string | null, string?][]
        ).map(([label, value, hint], i, arr) => (
          <div key={label} className={`kpi${i === arr.length - 1 ? " dark" : ""}`} title={hint}>
            <div className="l">{label}</div>
            <div className="v">{value ?? <Skeleton h={28} w={70} style={{ marginTop: 4, opacity: 0.6 }} />}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div className="eyebrow">Quick filters</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label className="sr-only" htmlFor="camp-search">
            Search campaigns
          </label>
          <input id="camp-search" className="input search-input" placeholder="Search campaigns" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
          <Segmented label="Date range" size="sm" value={range} onChange={setRange} options={[30, 60, 90].map((r) => ({ value: r, label: `${r} days` }))} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: -8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-label="Quick filters">
          {PRESETS.map((p) => (
            <button key={p.id} className="pill" aria-pressed={preset === p.id} onClick={() => pickPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{cur ? cur.note : "Custom sort. Click a column header to reverse it."}</div>
      </div>

      {rowsQ.loading && !rowsQ.data ? (
        <TableSkeleton />
      ) : (
        <div className="tbl-wrap" style={{ borderRadius: 16 }}>
          <div role="table" aria-label="Campaigns" style={{ minWidth: 1400 }}>
            <div role="row" className="tbl-head" style={{ gridTemplateColumns: GRID, borderBottom: "1px solid var(--border)" }}>
              <div role="columnheader" className="th-btn" style={{ display: "flex", alignItems: "center" }}>
                Campaign
              </div>
              {COLS.map((c) => (
                <button
                  key={c.key}
                  role="columnheader"
                  className="th-btn"
                  data-active={sort === c.key ? "true" : undefined}
                  aria-sort={sort === c.key ? (dir < 0 ? "descending" : "ascending") : "none"}
                  onClick={() => pickCol(c.key)}
                >
                  {c.label}
                  {sort === c.key ? (dir < 0 ? " ↓" : " ↑") : ""}
                </button>
              ))}
            </div>
            {rows.map((r) => (
              <div role="row" key={r.id} className="tbl-row" style={{ gridTemplateColumns: GRID, borderTop: 0, borderBottom: "1px solid var(--divider)", alignItems: "center" }}>
                <div role="cell" className="name-cell">
                  <div className="n">{r.name}</div>
                  <div className="s">{r.date}</div>
                </div>
                {COLS.map((c) => {
                  const v = r[c.key] as number | null;
                  return <NumCell key={c.key} v={v === null || !isFinite(v) ? "—" : c.fmt(v)} w={barWidth(v, mx[c.key]!)} active={sort === c.key} />;
                })}
              </div>
            ))}
            {rows.length === 0 && <Empty>{all.length === 0 ? "No sends in this range." : "No campaigns match."}</Empty>}
          </div>
        </div>
      )}

      <div className="card-lg" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Subject line style</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Revenue per 1,000 sent, grouped by how the subject line is written.</div>
        </div>
        {!s ? (
          <Skeleton h={60} />
        ) : s.styles.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No sends in this range.</div>
        ) : (
          s.styles.map((g) => (
            <div key={g.label} style={{ display: "grid", gridTemplateColumns: "minmax(90px,140px) 1fr minmax(120px,auto)", gap: 12, alignItems: "center", fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>
                {g.label} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({g.n})</span>
              </span>
              <div className="hbar">
                <div style={{ width: barWidth(g.rpe, s.styles[0].rpe) }} />
              </div>
              <span className="mono" style={{ textAlign: "right" }}>
                {money(g.rpe)} / 1k
              </span>
            </div>
          ))
        )}
      </div>

      {meta && <AttributionNote windowDays={meta.settings.windowDays} model={meta.settings.model} />}
    </div>
  );
}
