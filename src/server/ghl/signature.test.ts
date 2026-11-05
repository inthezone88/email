import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyMarketplaceSignature } from "./signature";
import { mapAppointmentStatus, normalizeEmailEvent, toCents } from "./mappers";

const body = JSON.stringify({ type: "AppointmentCreate", locationId: "loc1" });

describe("verifyMarketplaceSignature", () => {
  it("accepts a valid Ed25519 X-GHL-Signature and rejects tampering", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const env = { GHL_WEBHOOK_ED25519_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString() };
    const sig = sign(null, Buffer.from(body), privateKey).toString("base64");
    expect(verifyMarketplaceSignature(body, new Headers({ "x-ghl-signature": sig }), env)).toBe(true);
    expect(verifyMarketplaceSignature(body + " ", new Headers({ "x-ghl-signature": sig }), env)).toBe(false);
  });
  it("accepts a valid legacy RSA X-WH-Signature", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const env = { GHL_WEBHOOK_RSA_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString().replace(/\n/g, "\\n") };
    const sig = sign("sha256", Buffer.from(body), privateKey).toString("base64");
    expect(verifyMarketplaceSignature(body, new Headers({ "x-wh-signature": sig }), env)).toBe(true);
    expect(verifyMarketplaceSignature(body, new Headers({ "x-wh-signature": "AAAA" }), env)).toBe(false);
  });
  it("rejects when no key or no signature is configured", () => {
    expect(verifyMarketplaceSignature(body, new Headers(), {})).toBe(false);
    expect(verifyMarketplaceSignature(body, new Headers({ "x-ghl-signature": "x" }), {})).toBe(false);
  });
});

describe("mappers", () => {
  it("maps GHL statuses and amounts", () => {
    expect(mapAppointmentStatus("noshow")).toBe("noshow");
    expect(mapAppointmentStatus("no_show")).toBe("noshow");
    expect(mapAppointmentStatus("canceled")).toBe("cancelled");
    expect(mapAppointmentStatus("new")).toBe("booked");
    expect(toCents(19.99)).toBe(1999);
    expect(toCents("2000")).toBe(200000);
  });
  it("normalises email event payloads", () => {
    const e = normalizeEmailEvent({ event: "click", contact_id: "c1", url: "https://x.com/?utm_campaign=a", timestamp: "1762336800" })!;
    expect(e.type).toBe("clicked");
    expect(e.contactId).toBe("c1");
    expect(e.at.toISOString()).toBe("2025-11-05T10:00:00.000Z");
    expect(normalizeEmailEvent({ event: "something-else" })).toBeNull();
  });
});
