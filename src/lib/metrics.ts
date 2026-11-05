/**
 * Metric formulas ported from the prototype's renderVals(). Pure functions; the server
 * aggregates raw counts and these turn them into rates. `null` means "—" (no data) and
 * always sorts last.
 */
import type { SubjectStyle } from "./subject";

/** Raw per-email aggregates as produced by the server queries. */
export interface EmailAgg {
  id: string;
  name: string;
  subject: string | null;
  style: SubjectStyle;
  sentAt: string; // ISO
  fromAddress: string | null;
  sequenceStepId: string | null;
  utmCampaign: string | null;
  sent: number;
  opens: number; // unique contacts
  clicks: number; // unique contacts
  bounced: number;
  complained: number;
  unsubscribed: number;
  booked: number; // credited appointments, excluding cancelled
  showed: number;
  noshow: number;
  sales: number; // credited positive payments
  revCents: number; // credited payments net of refunds
  daysToBookSum: number;
  daysToBookN: number;
}

export interface CampaignRow {
  id: string;
  name: string;
  date: string;
  sentAt: string;
  style: SubjectStyle;
  sent: number;
  opens: number;
  clicks: number;
  ctor: number | null; // click-to-open = clicks / opens
  ctr: number | null; // click rate = unique clicks / sent
  booked: number;
  show: number | null; // showed / (showed + no-show): only calls that have happened
  close: number | null; // sales / showed
  days: number | null; // mean(booking − first attributed click)
  sales: number;
  rev: number; // dollars
  rpe: number | null; // revenue per 1k sent
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function toCampaignRow(e: EmailAgg): CampaignRow {
  const rev = e.revCents / 100;
  return {
    id: e.id,
    name: e.name,
    date: shortDate(e.sentAt),
    sentAt: e.sentAt,
    style: e.style,
    sent: e.sent,
    opens: e.opens,
    clicks: e.clicks,
    ctor: div(e.clicks, e.opens),
    ctr: div(e.clicks, e.sent),
    booked: e.booked,
    show: div(e.showed, e.showed + e.noshow),
    close: e.showed ? Math.min(1, e.sales / e.showed) : null,
    days: e.daysToBookN ? e.daysToBookSum / e.daysToBookN : null,
    sales: e.sales,
    rev,
    rpe: e.sent ? (rev / e.sent) * 1000 : null,
  };
}

// ---------- Sorting & presets (Campaigns tab) ----------
export type SortKey = "name" | "sent" | "opens" | "clicks" | "ctor" | "ctr" | "booked" | "show" | "close" | "days" | "sales" | "rev" | "rpe";

export interface Preset {
  id: string;
  label: string;
  sort: SortKey;
  dir: 1 | -1;
  note: string;
}

export const PRESETS: Preset[] = [
  { id: "all", label: "All campaigns", sort: "sent", dir: -1, note: "Every campaign, biggest sends first." },
  { id: "opens", label: "Most opens", sort: "opens", dir: -1, note: "Sorted by total opens." },
  { id: "clicks", label: "Most clicks", sort: "clicks", dir: -1, note: "Sorted by total clicks." },
  { id: "openclick", label: "High opens + clicks", sort: "clicks", dir: -1, note: "Only campaigns at or above the median for both opens and clicks, sorted by clicks." },
  { id: "ctor", label: "Best click-to-open", sort: "ctor", dir: -1, note: "Clicks divided by opens: how compelling the content was to those who opened." },
  { id: "booked", label: "Most booked calls", sort: "booked", dir: -1, note: "Calls booked by contacts who clicked this email." },
  { id: "show", label: "Best show rate", sort: "show", dir: -1, note: "Share of booked calls where the person showed up." },
  { id: "fast", label: "Fastest to book", sort: "days", dir: 1, note: "Fewest days between click and booking." },
  { id: "revenue", label: "Most revenue", sort: "rev", dir: -1, note: "Sales credited to this email, highest first." },
  { id: "converting", label: "Converting only", sort: "rev", dir: -1, note: "Hides campaigns that produced no revenue." },
];

/** Median as the prototype computes it: element at floor(n/2) of the ascending sort. */
export function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

export function filterAndSort(
  all: CampaignRow[],
  opts: { search: string; preset: string; sort: SortKey; dir: 1 | -1 },
): CampaignRow[] {
  const mo = median(all.map((x) => x.opens));
  const mc = median(all.map((x) => x.clicks));
  const q = opts.search.toLowerCase();
  let rows = all.filter((x) => x.name.toLowerCase().includes(q));
  if (opts.preset === "openclick") rows = rows.filter((x) => x.opens >= mo && x.clicks >= mc);
  if (opts.preset === "converting") rows = rows.filter((x) => x.rev > 0);
  return sortRows(rows, opts.sort, opts.dir);
}

/** Missing values sort last regardless of direction. */
export function sortRows<T extends object>(rows: T[], key: keyof T & string, dir: 1 | -1): T[] {
  return rows.slice().sort((a, b) => {
    const va = a[key] as unknown, vb = b[key] as unknown;
    const ma = va === null || va === undefined || (typeof va === "number" && !isFinite(va));
    const mb = vb === null || vb === undefined || (typeof vb === "number" && !isFinite(vb));
    if (ma && mb) return 0;
    if (ma) return 1;
    if (mb) return -1;
    if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
    return ((va as number) - (vb as number)) * dir;
  });
}

// ---------- Summary ----------
export interface Totals {
  sent: number;
  opens: number;
  clicks: number;
  booked: number;
  sales: number;
  rev: number;
}

export function totals(rows: CampaignRow[]): Totals {
  return rows.reduce(
    (a, x) => ({ sent: a.sent + x.sent, opens: a.opens + x.opens, clicks: a.clicks + x.clicks, booked: a.booked + x.booked, sales: a.sales + x.sales, rev: a.rev + x.rev }),
    { sent: 0, opens: 0, clicks: 0, booked: 0, sales: 0, rev: 0 },
  );
}

export interface WinnerLoser {
  k: string;
  name: string;
  value: number;
  format: "money" | "pct";
  tone: "good" | "bad";
}

export function winnersAndLosers(rows: CampaignRow[]): WinnerLoser[] {
  if (!rows.length) return [];
  const out: WinnerLoser[] = [];
  const best = rows.slice().sort((a, b) => b.rev - a.rev)[0];
  out.push({ k: "Top earner", name: best.name, value: best.rev, format: "money", tone: "good" });
  const bestC = sortRows(rows, "ctor", -1)[0];
  if (bestC.ctor !== null) out.push({ k: "Best click-to-open", name: bestC.name, value: bestC.ctor, format: "pct", tone: "good" });
  // Prototype used "sent > 3000"; generalised to "at or above the median send size" so it works at any list size.
  const ms = median(rows.map((r) => r.sent));
  const worst = rows.filter((x) => x.sent >= ms && x.rev <= 0).sort((a, b) => b.sent - a.sent)[0];
  if (worst) out.push({ k: "Biggest send, no revenue", name: worst.name, value: worst.rev, format: "money", tone: "bad" });
  return out;
}

export interface StyleGroup {
  label: SubjectStyle;
  n: number;
  rpe: number; // revenue per 1k sent
}

export function subjectStyleGroups(rows: CampaignRow[]): StyleGroup[] {
  const g = new Map<SubjectStyle, { sent: number; rev: number; n: number }>();
  for (const x of rows) {
    const cur = g.get(x.style) ?? { sent: 0, rev: 0, n: 0 };
    cur.sent += x.sent;
    cur.rev += x.rev;
    cur.n++;
    g.set(x.style, cur);
  }
  return [...g.entries()]
    .map(([label, v]) => ({ label, n: v.n, rpe: v.sent ? (v.rev / v.sent) * 1000 : 0 }))
    .sort((a, b) => b.rpe - a.rpe);
}

// ---------- List health ----------
export const LIMITS = {
  bounceRed: 0.02,
  bounceWatch: 0.014,
  spamRed: 0.001,
  spamWatch: 0.0008,
  unsubWatch: 0.005,
};

export type HealthStatus = "Act now" | "Watch" | "Healthy";

export function healthStatus(bounce: number, spam: number, unsub: number): HealthStatus {
  const bad = spam > LIMITS.spamRed || bounce > LIMITS.bounceRed;
  if (bad) return "Act now";
  const warn = spam > LIMITS.spamWatch || bounce > LIMITS.bounceWatch || unsub > LIMITS.unsubWatch;
  return warn ? "Watch" : "Healthy";
}

/** Width of the little bar under a number: value / column max, min 2%. */
export function barWidth(v: number | null, max: number): string {
  if (v === null || !isFinite(v)) return "0%";
  return Math.max(2, (v / (max || 1e-9)) * 100) + "%";
}
