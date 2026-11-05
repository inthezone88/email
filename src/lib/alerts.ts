/** Alert rules evaluated after each sync (README item F.20). Pure: inputs in, alerts out. */
import { LIMITS } from "./metrics";
import { pct } from "./format";

export interface AlertEmail {
  id: string;
  name: string;
  sentAt: Date;
  sent: number;
  bounced: number;
  complained: number;
  booked: number;
  showed: number;
  noshow: number;
  revCents: number;
}

export interface AlertInput {
  now: Date;
  windowDays: number;
  emails: AlertEmail[]; // sends in the evaluation period (e.g. last 90 days)
  bookedThisWeek: number;
  bookedLastWeek: number;
  topBookerThisWeek?: string | null; // email name with most credited bookings this week
}

export interface AlertOut {
  rule: string;
  severity: "red" | "amber" | "green";
  text: string;
  fingerprint: string; // stable per (rule, subject, period) so we don't re-notify
}

const MIN_SENT = 200; // ignore tiny sends: one complaint on 50 sends is noise
const DAY = 86_400_000;

export function evaluateAlerts(i: AlertInput): AlertOut[] {
  const out: AlertOut[] = [];
  const week = isoWeek(i.now);

  for (const e of i.emails) {
    if (e.sent < MIN_SENT) continue;
    const spam = e.complained / e.sent;
    if (spam > LIMITS.spamRed)
      out.push({ rule: "spam", severity: "red", fingerprint: `spam:${e.id}`, text: `${e.name} has a ${pct(spam, 2)} spam complaint rate, above the 0.10% limit. Pause or trim that segment.` });
    const bounce = e.bounced / e.sent;
    if (bounce > LIMITS.bounceRed)
      out.push({ rule: "bounce", severity: "red", fingerprint: `bounce:${e.id}`, text: `${e.name} bounced ${pct(bounce)} of sends, above the 2% limit. Clean that list before the next send.` });
  }

  // Show-rate drop vs the account average (only for sends with enough bookings to mean something).
  // Show rate = showed / calls that have happened (upcoming calls don't count against it).
  const held = (e: AlertEmail) => e.showed + e.noshow;
  const tb = i.emails.reduce((a, e) => a + held(e), 0);
  const ts = i.emails.reduce((a, e) => a + e.showed, 0);
  if (tb >= 10) {
    const avg = ts / tb;
    for (const e of i.emails) {
      if (held(e) < 5) continue;
      const r = e.showed / held(e);
      if (r < avg - 0.15)
        out.push({ rule: "show_drop", severity: "amber", fingerprint: `show:${e.id}`, text: `${e.name}: ${pct(r, 0)} of booked calls showed up, below your ${pct(avg, 0)} average. Check the reminder sequence.` });
    }
  }

  // Booked calls week over week.
  if (i.bookedLastWeek >= 5) {
    const ch = (i.bookedThisWeek - i.bookedLastWeek) / i.bookedLastWeek;
    if (Math.abs(ch) >= 0.2) {
      const up = ch > 0;
      const driver = up && i.topBookerThisWeek ? `, driven by ${i.topBookerThisWeek}` : "";
      out.push({
        rule: "booked_wow",
        severity: up ? "green" : "amber",
        fingerprint: `wow:${week}`,
        text: `Booked calls are ${up ? "up" : "down"} ${Math.round(Math.abs(ch) * 100)}% on last week${driver}.`,
      });
    }
  }

  // A send whose attribution window has closed with zero credited revenue.
  for (const e of i.emails) {
    if (e.sent < MIN_SENT || e.revCents > 0) continue;
    const closed = e.sentAt.getTime() + i.windowDays * DAY <= i.now.getTime();
    const recent = i.now.getTime() - e.sentAt.getTime() <= (i.windowDays + 7) * DAY; // only alert once, right after it closes
    if (closed && recent)
      out.push({ rule: "zero_revenue", severity: "amber", fingerprint: `zero:${e.id}:${i.windowDays}`, text: `${e.name} went to ${e.sent.toLocaleString("en-US")} people and earned nothing in its ${i.windowDays}-day window.` });
  }

  const order = { red: 0, amber: 1, green: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t.getTime() - y0.getTime()) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}
