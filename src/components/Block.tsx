"use client";
import { NumCell } from "./ui";
import { barWidth } from "@/lib/metrics";

export interface BlockCell {
  v: string;
  num: number | null; // drives the bar width; null = no bar
  color?: string;
  bold?: boolean;
}
export interface BlockRow {
  key: string;
  name: string;
  sub: string;
  cells: BlockCell[];
}

/** The card+table used by Sequences, Segments and List health (prototype's mk()). */
export function Block({ title, note, heads, rows }: { title: string; note: string; heads: string[]; rows: BlockRow[] }) {
  const gt = `minmax(200px,2fr) repeat(${heads.length - 1},minmax(90px,1fr))`;
  const max = heads.slice(1).map((_, j) => Math.max(...rows.map((r) => (r.cells[j].num !== null && isFinite(r.cells[j].num!) ? r.cells[j].num! : 0)), 1e-9));
  return (
    <section className="tbl-wrap" aria-label={title}>
      <div style={{ minWidth: 760 }}>
        <div style={{ padding: "16px 18px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h2>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{note}</div>
        </div>
        <div role="table" aria-label={title}>
          <div role="row" className="tbl-head" style={{ gridTemplateColumns: gt }}>
            {heads.map((h) => (
              <div role="columnheader" key={h} className="th">
                {h}
              </div>
            ))}
          </div>
          {rows.map((r) => (
            <div role="row" key={r.key} className="tbl-row" style={{ gridTemplateColumns: gt }}>
              <div role="cell" className="name-cell">
                <div className="n">{r.name}</div>
                <div className="s">{r.sub}</div>
              </div>
              {r.cells.map((c, j) => (
                <NumCell key={j} v={c.v} w={c.num === null ? "0%" : barWidth(c.num, max[j])} color={c.color} bold={c.bold} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
