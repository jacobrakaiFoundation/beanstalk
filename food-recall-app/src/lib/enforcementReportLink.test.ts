import { describe, expect, it } from "vitest";
import { fdaEnforcementReportURL } from "./enforcementReportLink";

describe("fdaEnforcementReportURL", () => {
  it("builds the FDA enforcement report from a numeric event id", () => {
    expect(fdaEnforcementReportURL(" 100041 ")).toBe(
      "https://www.accessdata.fda.gov/scripts/ires/index.cfm?Event=100041",
    );
  });

  it("returns null when the event id is not an iRES event id", () => {
    expect(fdaEnforcementReportURL("")).toBeNull();
    expect(fdaEnforcementReportURL("F-100-2026")).toBeNull();
    expect(fdaEnforcementReportURL("0100041")).toBeNull();
    expect(fdaEnforcementReportURL("1000410000000")).toBeNull();
  });
});
