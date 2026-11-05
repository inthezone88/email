/** Turn raw contact events + attribution credits into the Journeys timeline (pure). */

export type Dot = "green" | "amber" | "red" | "neutral" | "ink";

export interface TimelineItem {
  at: string;
  label: string;
  detail: string;
  dot: Dot;
  credited?: boolean;
}

export interface RawEvent {
  kind: string; // sent | opened | clicked | bounced | complained | unsubscribed | appointment | payment
  at: string | Date;
  emailId: string | null;
  emailName: string | null;
  url: string | null;
  id: string;
  status?: string | null;
  amountCents?: number | null;
  title?: string | null;
  startAt?: string | Date | null;
  description?: string | null;
  refundOf?: string | null;
}

export interface RawCredit {
  conversionType: string;
  conversionId: string;
  emailId: string | null;
  emailName: string | null;
  clickEventId: number | string | null;
  firstClickAt: string | Date | null;
  convertedAt: string | Date;
}

const iso = (d: string | Date) => new Date(d).toISOString();
const fmtWhen = (d: string | Date) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
const money = (c: number) => "$" + Math.round(Math.abs(c) / 100).toLocaleString("en-US");
const DAY = 86_400_000;

function utmCampaign(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("utm_campaign");
  } catch {
    return null;
  }
}

export function buildTimeline(events: RawEvent[], credits: RawCredit[]): TimelineItem[] {
  const creditedClicks = new Set(credits.filter((c) => c.clickEventId !== null).map((c) => String(c.clickEventId)));
  const creditOf = new Map(credits.map((c) => [`${c.conversionType}:${c.conversionId}`, c]));
  const opened = new Set(events.filter((e) => e.kind === "opened").map((e) => e.emailId));
  const clicked = new Set(events.filter((e) => e.kind === "clicked").map((e) => e.emailId));
  const firstClickAt = events.filter((e) => e.kind === "clicked").map((e) => new Date(e.at).getTime()).sort((a, b) => a - b)[0];

  const out: TimelineItem[] = [];
  const sorted = events.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  for (const e of sorted) {
    const name = e.emailName ?? "email";
    switch (e.kind) {
      case "sent": {
        const detail = clicked.has(e.emailId) ? "Opened and clicked" : opened.has(e.emailId) ? "Opened, no click" : "No click";
        out.push({ at: iso(e.at), label: `Sent: ${name}`, detail, dot: "neutral" });
        break;
      }
      case "clicked": {
        const credited = creditedClicks.has(e.id);
        const utm = utmCampaign(e.url);
        const parts = [utm ? `utm_campaign=${utm}` : e.url ? "Untagged link" : null, credited ? "Credited for a later conversion" : null].filter(Boolean);
        out.push({ at: iso(e.at), label: `Clicked: ${name}`, detail: parts.join(" · "), dot: "green", credited });
        break;
      }
      case "bounced":
        out.push({ at: iso(e.at), label: `Bounced: ${name}`, detail: "Address could not receive mail", dot: "amber" });
        break;
      case "unsubscribed":
        out.push({ at: iso(e.at), label: `Unsubscribed via ${name}`, detail: "", dot: "amber" });
        break;
      case "complained":
        out.push({ at: iso(e.at), label: `Marked ${name} as spam`, detail: "", dot: "red" });
        break;
      case "appointment": {
        const c = creditOf.get(`appointment:${e.id}`);
        const when = e.startAt ? fmtWhen(e.startAt) : null;
        const credit = c?.emailName ? `credited to ${c.emailName}` : "unattributed (no qualifying click)";
        out.push({ at: iso(e.at), label: "Booked a call", detail: [e.title, when, credit].filter(Boolean).join(" · "), dot: "green", credited: !!c?.emailId });
        const outcomeAt = e.startAt ?? e.at;
        if (e.status === "showed") out.push({ at: iso(outcomeAt), label: "Showed up", detail: "", dot: "green" });
        if (e.status === "noshow") out.push({ at: iso(outcomeAt), label: "No show", detail: "", dot: "red" });
        if (e.status === "cancelled") out.push({ at: iso(outcomeAt), label: "Cancelled", detail: "", dot: "amber" });
        break;
      }
      case "payment": {
        const c = creditOf.get(`payment:${e.id}`);
        const amt = e.amountCents ?? 0;
        if (amt < 0) {
          out.push({ at: iso(e.at), label: `Refunded ${money(amt)}`, detail: c?.emailName ? `Deducted from ${c.emailName}` : "", dot: "red" });
        } else {
          const days = firstClickAt ? Math.round((new Date(e.at).getTime() - firstClickAt) / DAY) : null;
          const parts = [e.description, days !== null && days >= 0 ? `${days} days after first click` : null, c?.emailName ? `credited to ${c.emailName}` : "unattributed"];
          out.push({ at: iso(e.at), label: `Paid ${money(amt)}`, detail: parts.filter(Boolean).join(" · "), dot: "ink", credited: !!c?.emailId });
        }
        break;
      }
      // "opened" is folded into the Sent row: opens are unreliable (Apple MPP) and add noise.
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export { fmtWhen };
