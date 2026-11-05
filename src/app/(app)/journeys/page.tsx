"use client";
import { useEffect, useState } from "react";
import { api, useApi } from "@/components/hooks";
import { C, Empty, ErrorBox, Skeleton } from "@/components/ui";
import type { TimelineItem } from "@/lib/journey";
import { money } from "@/lib/format";

type Contact = { id: string; name: string; emails: number; revCents: number; status: string };
type Journey = { id: string; name: string; events: TimelineItem[] };
const DOT = { green: C.green, amber: C.amberDot, red: C.red, neutral: C.neutral, ink: C.ink };

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false })}`;
};

export default function JourneysPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useApi<{ data: Contact[] }>(`/api/contacts?q=${encodeURIComponent(debounced)}`);
  const contacts = list.data?.data ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const selected = sel && contacts.some((c) => c.id === sel) ? sel : contacts[0]?.id ?? null;
  const j = useApi<{ data: Journey }>(selected ? `/api/contacts/${encodeURIComponent(selected)}/journey` : null);
  const cur = contacts.find((c) => c.id === selected);

  const del = async () => {
    if (!cur || !confirm(`Delete all stored data for ${cur.name}? This removes their events, bookings, payments and credits from this dashboard. It does not touch GoHighLevel.`)) return;
    try {
      await api(`/api/contacts/${encodeURIComponent(cur.id)}`, { method: "DELETE" });
      setSel(null);
      list.reload();
    } catch (e) {
      alert((e as { message: string }).message);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label className="sr-only" htmlFor="contact-search">
            Search contacts
          </label>
          <input id="contact-search" className="input" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 220px)", minHeight: 280, overflowY: "auto", paddingRight: 2 }}>
          {list.loading && !list.data
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={64} style={{ borderRadius: 14 }} />)
            : contacts.map((c) => {
                const on = c.id === selected;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSel(c.id)}
                    aria-pressed={on}
                    style={{ textAlign: "left", minHeight: 64, border: `1px solid ${on ? "#1b1a17" : "#e1ded6"}`, background: on ? "#1b1a17" : "#fbfaf7", color: on ? "#f4f2ee" : "#1b1a17", borderRadius: 14, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                  >
                    <span>
                      <span style={{ fontSize: 15, fontWeight: 600, display: "block" }}>{c.name}</span>
                      <span style={{ fontSize: 12, opacity: 0.75 }}>
                        {c.status} · {c.emails} email{c.emails === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="mono" style={{ fontSize: 14, fontWeight: 500 }}>
                      {c.revCents > 0 ? money(c.revCents / 100) : "No sale"}
                    </span>
                  </button>
                );
              })}
          </div>
          {list.data && contacts.length === 0 && <Empty>{debounced ? "No contacts match." : "No contacts yet."}</Empty>}
          {contacts.length === 50 && <div style={{ fontSize: 12, color: "var(--muted)" }}>Showing the top 50 by revenue. Search to find anyone else.</div>}
        </div>

        <div className="card-lg" style={{ padding: 20 }}>
          {!selected ? (
            <Empty>Pick a contact to see every email, click, booking and payment in order.</Empty>
          ) : j.loading && !j.data ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Skeleton h={24} w="40%" />
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} h={36} />
              ))}
            </div>
          ) : j.error ? (
            <ErrorBox error={j.error} onRetry={j.reload} />
          ) : j.data ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{j.data.data.name}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 18px" }}>
                {cur ? `${cur.status} · ${cur.emails} emails · ` : ""}every email, click, booking and payment in order
              </div>
              <ol style={{ display: "flex", flexDirection: "column", listStyle: "none", margin: 0, padding: 0 }}>
                {j.data.data.events.map((e, i) => (
                  <li key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 12, alignItems: "start", paddingBottom: 18 }}>
                    <span style={{ marginTop: 4, width: 12, height: 12, borderRadius: "50%", background: DOT[e.dot], justifySelf: "center", boxShadow: e.credited ? "0 0 0 3px #e6efe8" : undefined }} aria-hidden />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {e.label}
                        {e.credited && (
                          <span className="mono" style={{ marginLeft: 8, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: C.green, fontWeight: 500 }}>
                            Credited
                          </span>
                        )}
                      </div>
                      {e.detail && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{e.detail}</div>}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {when(e.at)}
                    </div>
                  </li>
                ))}
              </ol>
              {j.data.data.events.length === 0 && <Empty>No tracked activity for this contact yet.</Empty>}
              <button onClick={del} style={{ marginTop: 8, background: "none", border: 0, padding: 0, minHeight: 44, fontSize: 12, color: "var(--muted)", textDecoration: "underline" }}>
                Delete this contact&apos;s data
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
