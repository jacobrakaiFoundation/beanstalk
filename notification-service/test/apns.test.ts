import { describe, expect, it } from "vitest";
import { APNS_EXPIRATION_SECONDS, apnsExpirationHeader } from "../src/apns.js";

describe("APNs payload headers", () => {
  it("sets a bounded one-hour expiration timestamp", () => {
    const now = Date.parse("2026-09-13T20:00:00.000Z");
    const expiration = Number(apnsExpirationHeader(now));
    expect(expiration).toBe(Math.floor(now / 1000) + APNS_EXPIRATION_SECONDS);
    expect(expiration - Math.floor(now / 1000)).toBe(3600);
  });
});
