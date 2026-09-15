import { describe, expect, it } from "vitest";
import { type FsisApiRecord, isArchived, mapFsisRecord } from "./fsis";

const activeRecord: FsisApiRecord = {
  field_title: "El Eden Import Distributor Corp Recalls Ineligible Pork Cracklings Products",
  field_recall_number: "021-2026",
  field_recall_url: "http://www.fsis.usda.gov/recalls-alerts/el-eden-import-distributor-corp",
  field_recall_type: "Active Recall",
  field_recall_classification: "Class I",
  field_recall_reason: ["Import Violation"],
  field_recall_date: "2026-09-09",
  field_states: ["New Jersey", "Utah"],
  field_establishment: [],
  field_product_items: "45-g. foil bags, 3,204 pounds total",
  field_summary: "<p><strong>WASHINGTON, Sept. 09, 2026</strong>, El Eden Import Distributor Corp.</p>",
  field_archive_recall: "False",
};

describe("mapFsisRecord", () => {
  it("maps a full active record to the Recall shape", () => {
    const r = mapFsisRecord(activeRecord);
    expect(r).not.toBeNull();
    expect(r!.id).toBe("FSIS-021-2026");
    expect(r!.recallNumber).toBe("FSIS-021-2026");
    expect(r!.source).toBe("USDA-FSIS");
    expect(r!.classification).toBe("Class I");
    expect(r!.status).toBe("Active Recall");
    expect(r!.country).toBe("");
    expect(r!.voluntaryMandated).toBe("");
    expect(r!.initialFirmNotification).toBe("");
    expect(r!.recallingFirm).toBe("El Eden Import Distributor Corp");
    expect(r!.distributionPattern).toBe("New Jersey, Utah");
    expect(r!.recallInitiationDate).toBe("20260909");
    expect(r!.reasonForRecall).toBe("Import Violation");
    expect(r!.hazard).toBe("Import Violation");
    expect(r!.productQuantity).toBe("3,204 pounds");
    expect(r!.link).toBe("http://www.fsis.usda.gov/recalls-alerts/el-eden-import-distributor-corp");
    expect(r!.moreCodeInfo).toContain("WASHINGTON, Sept. 09, 2026");
    expect(r!.moreCodeInfo).not.toContain("<p>");
  });

  it("keeps Public Health Alert as the FSIS status and Unknown classification", () => {
    const r = mapFsisRecord({
      ...activeRecord,
      field_recall_type: "Public Health Alert",
      field_recall_classification: "Public Health Alert",
    });
    expect(r!.status).toBe("Public Health Alert");
    expect(r!.classification).toBe("Unknown");
  });

  it("keeps Closed Recall as the FSIS status instead of inventing Completed", () => {
    const r = mapFsisRecord({ ...activeRecord, field_recall_type: "Closed Recall" });
    expect(r!.status).toBe("Closed Recall");
  });

  it("strips entity-encoded tags so summaries cannot reconstitute markup", () => {
    const r = mapFsisRecord({
      ...activeRecord,
      field_summary: "&lt;script&gt;alert(1)&lt;/script&gt;<p>Safe excerpt</p>",
    });
    expect(r!.moreCodeInfo).toContain("alert(1)");
    expect(r!.moreCodeInfo).toContain("Safe excerpt");
    expect(r!.moreCodeInfo).not.toMatch(/<script/i);
    expect(r!.moreCodeInfo).not.toContain("<p>");
  });

  it("joins multiple reasons and falls back to a stable id without a recall number", () => {
    const r = mapFsisRecord({
      ...activeRecord,
      field_recall_number: "",
      field_recall_reason: ["Misbranding", "Unreported Allergens"],
    });
    expect(r!.reasonForRecall).toBe("Misbranding; Unreported Allergens");
    expect(r!.id.startsWith("FSIS-")).toBe(true);
  });

  it("returns null when the title is missing", () => {
    expect(mapFsisRecord({ ...activeRecord, field_title: "" })).toBeNull();
    expect(mapFsisRecord({})).toBeNull();
  });

  it("rejects malformed dates", () => {
    const r = mapFsisRecord({ ...activeRecord, field_recall_date: "Sept 9 2026" });
    expect(r!.recallInitiationDate).toBe("");
  });
});

describe("isArchived", () => {
  it("detects string and boolean archive flags", () => {
    expect(isArchived({ field_archive_recall: "True" })).toBe(true);
    expect(isArchived({ field_archive_recall: true })).toBe(true);
    expect(isArchived({ field_archive_recall: "False" })).toBe(false);
    expect(isArchived({})).toBe(false);
  });
});
