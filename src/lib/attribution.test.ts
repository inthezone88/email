import { describe, expect, it } from "vitest";
import { attribute, type Click, type Conversion } from "./attribution";

const d = (s: string) => new Date(s + "Z");
const click = (id: number, contactId: string, emailId: string, at: string): Click => ({ id, contactId, emailId, at: d(at) });
const S14 = { windowDays: 14, model: "last_click" as const };

describe("attribute", () => {
  it("credits the last click within the window when there are multiple clicks", () => {
    const clicks = [click(1, "c1", "A", "2026-03-01T09:00:00"), click(2, "c1", "B", "2026-03-05T09:00:00"), click(3, "c1", "C", "2026-03-06T09:00:00")];
    const conv: Conversion[] = [{ type: "appointment", id: "ap1", contactId: "c1", at: d("2026-03-06T09:20:00") }];
    const [a] = attribute(clicks, conv, S14);
    expect(a.emailId).toBe("C");
    expect(a.clickEventId).toBe(3);
  });

  it("first_click model credits the earliest qualifying click", () => {
    const clicks = [click(1, "c1", "A", "2026-03-01T09:00:00"), click(2, "c1", "B", "2026-03-05T09:00:00")];
    const [a] = attribute(clicks, [{ type: "payment", id: "p1", contactId: "c1", at: d("2026-03-09T10:00:00"), amountCents: 400000 }], { windowDays: 14, model: "first_click" });
    expect(a.emailId).toBe("A");
    expect(a.amountCents).toBe(400000);
  });

  it("ignores clicks outside the window (first-click model too)", () => {
    const clicks = [click(1, "c1", "OLD", "2026-02-01T09:00:00"), click(2, "c1", "NEW", "2026-03-01T09:00:00")];
    const conv: Conversion[] = [{ type: "appointment", id: "ap1", contactId: "c1", at: d("2026-03-10T09:00:00") }];
    expect(attribute(clicks, conv, { windowDays: 14, model: "first_click" })[0].emailId).toBe("NEW");
    expect(attribute(clicks, conv, { windowDays: 7, model: "last_click" })[0].emailId).toBeNull();
  });

  it("window boundary is inclusive (exactly N days)", () => {
    const clicks = [click(1, "c1", "A", "2026-03-01T09:00:00")];
    const conv: Conversion[] = [{ type: "appointment", id: "ap1", contactId: "c1", at: d("2026-03-15T09:00:00") }];
    expect(attribute(clicks, conv, S14)[0].emailId).toBe("A");
  });

  it("never credits clicks after the conversion, or another contact's clicks", () => {
    const clicks = [click(1, "c1", "LATER", "2026-03-10T09:00:00"), click(2, "c2", "OTHER", "2026-03-05T09:00:00")];
    const [a] = attribute(clicks, [{ type: "appointment", id: "ap1", contactId: "c1", at: d("2026-03-06T09:00:00") }], S14);
    expect(a.emailId).toBeNull();
  });

  it("conversions with no clicks are unattributed", () => {
    const [a] = attribute([], [{ type: "payment", id: "p1", contactId: "c9", at: d("2026-03-06T09:00:00"), amountCents: 100 }], S14);
    expect(a.emailId).toBeNull();
    expect(a.clickAt).toBeNull();
    expect(a.amountCents).toBe(100);
  });

  it("refunds inherit the original payment's email as negative revenue, even outside the window", () => {
    const clicks = [click(1, "c1", "A", "2026-03-01T09:00:00")];
    const conv: Conversion[] = [
      { type: "payment", id: "refund1", contactId: "c1", at: d("2026-05-01T09:00:00"), amountCents: -50000, refundOf: "p1" },
      { type: "payment", id: "p1", contactId: "c1", at: d("2026-03-02T09:00:00"), amountCents: 200000 },
    ];
    const res = attribute(clicks, conv, S14);
    const refund = res.find((r) => r.conversionId === "refund1")!;
    expect(refund.emailId).toBe("A");
    expect(refund.amountCents).toBe(-50000);
    const net = res.filter((r) => r.emailId === "A").reduce((s, r) => s + r.amountCents, 0);
    expect(net).toBe(150000);
  });

  it("refund of an unknown payment is attributed on its own", () => {
    const [a] = attribute([], [{ type: "payment", id: "r", contactId: "c1", at: d("2026-03-02T09:00:00"), amountCents: -100, refundOf: "missing" }], S14);
    expect(a.emailId).toBeNull();
  });

  it("records the contact's first click on the credited email for days-to-book", () => {
    const clicks = [click(1, "c1", "A", "2026-03-01T09:00:00"), click(2, "c1", "A", "2026-03-04T09:00:00")];
    const [a] = attribute(clicks, [{ type: "appointment", id: "ap", contactId: "c1", at: d("2026-03-05T09:00:00") }], S14);
    expect(a.clickAt).toEqual(d("2026-03-04T09:00:00"));
    expect(a.firstClickAt).toEqual(d("2026-03-01T09:00:00"));
  });

  it("is order independent for input clicks", () => {
    const clicks = [click(3, "c1", "C", "2026-03-06T09:00:00"), click(1, "c1", "A", "2026-03-01T09:00:00")];
    expect(attribute(clicks, [{ type: "appointment", id: "x", contactId: "c1", at: d("2026-03-07T00:00:00") }], S14)[0].emailId).toBe("C");
  });
});
