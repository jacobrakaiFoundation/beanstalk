import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("service configuration", () => {
  it("rejects more than the current and prior FDA annual XML sources", () => {
    vi.stubEnv(
      "FDA_ANNUAL_XML_URLS",
      [
        "https://www.fda.gov/media/current/download?attachment=",
        "https://www.fda.gov/media/prior/download?attachment=",
        "https://www.fda.gov/media/extra/download?attachment=",
      ].join(","),
    );

    expect(() => loadConfig()).toThrow("FDA_ANNUAL_XML_URLS must include at most 2 official XML URLs");
  });
});
