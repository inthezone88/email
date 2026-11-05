import { describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("./ghl/client", () => ({}));
vi.mock("./ghl/sync", () => ({}));
import { msUntilUtc } from "./scheduler";

describe("msUntilUtc", () => {
  it("targets later today, or tomorrow once the time has passed", () => {
    expect(msUntilUtc(7, 17, new Date("2026-11-05T07:00:00Z"))).toBe(17 * 60_000);
    expect(msUntilUtc(7, 17, new Date("2026-11-05T07:17:00Z"))).toBe(24 * 3_600_000);
    expect(msUntilUtc(7, 17, new Date("2026-11-05T23:00:00Z"))).toBe((8 * 60 + 17) * 60_000);
  });
});
