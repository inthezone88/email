import { describe, expect, it } from "vitest";
import { filterAndSort, healthStatus, median, sortRows, subjectStyleGroups, toCampaignRow, winnersAndLosers, type EmailAgg } from "./metrics";
import { classifySubject } from "./subject";
import { evaluateAlerts } from "./alerts";

const agg = (o: Partial<EmailAgg>): EmailAgg => ({
  id: "e", name: "E", subject: null, style: "Plain", sentAt: "2026-10-01T00:00:00Z", fromAddress: null, sequenceStepId: null, utmCampaign: null,
  sent: 1000, opens: 400, clicks: 50, bounced: 0, complained: 0, unsubscribed: 0, booked: 0, showed: 0, noshow: 0, sales: 0, revCents: 0, daysToBookSum: 0, daysToBookN: 0, ...o,
});

describe("toCampaignRow", () => {
  it("computes the README metric definitions", () => {
    const r = toCampaignRow(agg({ sent: 4000, opens: 2000, clicks: 200, booked: 20, showed: 15, noshow: 5, sales: 5, revCents: 950000, daysToBookSum: 40, daysToBookN: 20 }));
    expect(r.ctr).toBeCloseTo(0.05);
    expect(r.ctor).toBeCloseTo(0.1);
    expect(r.show).toBeCloseTo(0.75); // 15 showed / (15 + 5 no-shows)
    expect(r.close).toBeCloseTo(5 / 15);
    expect(r.days).toBeCloseTo(2);
    expect(r.rev).toBe(9500);
    expect(r.rpe).toBeCloseTo(2375);
  });
  it("uses null for undefined rates", () => {
    const r = toCampaignRow(agg({ opens: 0, booked: 0 }));
    expect(r.ctor).toBeNull();
    expect(r.show).toBeNull();
    expect(r.close).toBeNull();
    expect(r.days).toBeNull();
  });
});

describe("sorting and presets", () => {
  const rows = [
    toCampaignRow(agg({ id: "a", name: "Alpha", opens: 100, clicks: 10, booked: 2, showed: 1, noshow: 1 })),
    toCampaignRow(agg({ id: "b", name: "Beta", opens: 500, clicks: 80, revCents: 100 })),
    toCampaignRow(agg({ id: "c", name: "Gamma", opens: 300, clicks: 40 })),
  ];
  it("missing values sort last in both directions", () => {
    expect(sortRows(rows, "show", -1).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(sortRows(rows, "show", 1)[0].id).toBe("a");
  });
  it("High opens + clicks keeps rows at or above both medians", () => {
    expect(median([100, 500, 300])).toBe(300);
    expect(filterAndSort(rows, { search: "", preset: "openclick", sort: "clicks", dir: -1 }).map((r) => r.id)).toEqual(["b", "c"]);
  });
  it("Converting only + search", () => {
    expect(filterAndSort(rows, { search: "", preset: "converting", sort: "rev", dir: -1 }).map((r) => r.id)).toEqual(["b"]);
    expect(filterAndSort(rows, { search: "gam", preset: "all", sort: "sent", dir: -1 }).map((r) => r.id)).toEqual(["c"]);
  });
  it("winners and losers + subject groups", () => {
    const wl = winnersAndLosers(rows);
    expect(wl[0]).toMatchObject({ k: "Top earner", name: "Beta" });
    expect(wl.find((w) => w.k === "Biggest send, no revenue")).toBeTruthy();
    const g = subjectStyleGroups(rows);
    expect(g[0]).toMatchObject({ label: "Plain", n: 3 });
  });
});

describe("health thresholds", () => {
  it("matches the prototype limits", () => {
    expect(healthStatus(0.031, 0.0003, 0.002)).toBe("Act now");
    expect(healthStatus(0.004, 0.0014, 0.002)).toBe("Act now");
    expect(healthStatus(0.015, 0.0003, 0.002)).toBe("Watch");
    expect(healthStatus(0.004, 0.0009, 0.002)).toBe("Watch");
    expect(healthStatus(0.004, 0.0003, 0.006)).toBe("Watch");
    expect(healthStatus(0.004, 0.0003, 0.002)).toBe("Healthy");
  });
});

describe("classifySubject", () => {
  it.each([
    ["Last call: strategy slots", "Urgency"],
    ["Want more leads?", "Question"],
    ["Case study: 3x leads", "Number"],
    ["Weekly newsletter #42", "Plain"],
    ["Free audit invite", "Plain"],
    ["Doors close tonight", "Urgency"],
  ])("%s → %s", (s, style) => expect(classifySubject(s)).toBe(style));
});

describe("alerts", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const e = (o: Partial<Parameters<typeof evaluateAlerts>[0]["emails"][0]>) => ({ id: "x", name: "X", sentAt: new Date("2026-11-01T00:00:00Z"), sent: 3000, bounced: 0, complained: 0, booked: 0, showed: 0, noshow: 0, revCents: 1, ...o });
  it("flags spam, bounce, show drop, wow and zero revenue", () => {
    const res = evaluateAlerts({
      now, windowDays: 14, bookedThisWeek: 22, bookedLastWeek: 18, topBookerThisWeek: "Last call",
      emails: [
        e({ id: "spam", name: "Reactivation", complained: 5 }),
        e({ id: "bounce", bounced: 90 }),
        e({ id: "show", name: "Webinar replay", booked: 10, showed: 4, noshow: 6 }),
        e({ id: "good", booked: 20, showed: 16, noshow: 4 }),
        e({ id: "zero", name: "Newsletter", revCents: 0, sentAt: new Date("2026-10-20T00:00:00Z") }),
      ],
    });
    expect(res.map((r) => r.rule)).toEqual(["spam", "bounce", "show_drop", "zero_revenue", "booked_wow"]);
    expect(res[0].text).toContain("0.17% spam complaint rate");
    expect(res.find((r) => r.rule === "booked_wow")!.text).toBe("Booked calls are up 22% on last week, driven by Last call.");
  });
  it("no zero-revenue alert while the window is still open", () => {
    expect(evaluateAlerts({ now, windowDays: 14, bookedThisWeek: 0, bookedLastWeek: 0, emails: [e({ revCents: 0 })] })).toEqual([]);
  });
});
