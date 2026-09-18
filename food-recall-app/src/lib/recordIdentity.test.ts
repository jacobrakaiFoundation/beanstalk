import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache, fetchRecalls } from "./api";

const product = {
  recalling_firm: "Example Foods",
  product_description: "Packaged crackers",
  reason_for_recall: "Undeclared milk",
  code_info: "Lot A",
};

async function loadRecords(results: Record<string, unknown>[]) {
  const fsisEmpty = { ok: true, json: async () => [] as unknown[] };
  const fetchMock = vi.fn((url: unknown) => {
    if (String(url).includes("/api/fsis-recalls")) return Promise.resolve(fsisEmpty);
    return Promise.resolve({
      ok: true,
      json: async () => ({ results, meta: { results: { total: results.length } } }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const result = await fetchRecalls({ limit: 20, skip: 0 });
  expect(fetchMock.mock.calls.filter((c) => !String(c[0]).includes("/api/fsis-recalls"))).toHaveLength(1);
  expect(result.error).toBeNull();
  expect(result.isDemo).toBe(false);
  expect(result.isStale).toBe(false);
  return result.recalls;
}

describe("FDA record identity and deduplication", () => {
  beforeEach(() => {
    clearCache();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    clearCache();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retains distinct products sharing an event when recall numbers are missing", async () => {
    const rows = [
      { ...product, event_id: "event-123", product_description: "Crackers" },
      { ...product, event_id: "event-123", product_description: "Cookies" },
    ];
    const first = await loadRecords(rows);
    expect(first.map((r) => r.productDescription)).toEqual(["Crackers", "Cookies"]);
    expect(new Set(first.map((r) => r.id)).size).toBe(2);

    clearCache();
    const repeated = await loadRecords(rows);
    expect(repeated.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  it("retains distinct lots of the same product in a shared event", async () => {
    const recalls = await loadRecords([
      { ...product, event_id: "event-123", code_info: "Lot A" },
      { ...product, event_id: "event-123", code_info: "Lot B" },
    ]);
    expect(recalls.map((r) => r.codeInfo)).toEqual(["Lot A", "Lot B"]);
    expect(new Set(recalls.map((r) => r.id)).size).toBe(2);
  });

  it("deduplicates identical unidentified rows and keeps IDs stable across result order", async () => {
    const other = { ...product, product_description: "Rice cakes" };
    const first = await loadRecords([product, other, { ...product }]);
    expect(first).toHaveLength(2);
    const firstIds = Object.fromEntries(first.map((r) => [r.productDescription, r.id]));

    clearCache();
    const reordered = await loadRecords([other, { ...product }, product]);
    expect(reordered).toHaveLength(2);
    expect(Object.fromEntries(reordered.map((r) => [r.productDescription, r.id]))).toEqual(firstIds);
  });

  it("deduplicates a repeated recall number while keeping the first record", async () => {
    const recalls = await loadRecords([
      { ...product, recall_number: "F-123-2026" },
      { ...product, recall_number: "F-123-2026", code_info: "Duplicate update" },
    ]);
    expect(recalls).toHaveLength(1);
    expect(recalls[0].id).toBe("F-123-2026");
    expect(recalls[0].codeInfo).toBe("Lot A");
  });

  it.each([
    { recall_number: { invalid: true }, event_id: 123 },
    { recall_number: 456, event_id: { invalid: true } },
  ])("uses string IDs for wrong-type identifiers: %j", async (identifiers) => {
    const recalls = await loadRecords([{ ...product, ...identifiers }]);
    expect(recalls).toHaveLength(1);
    const recall = recalls[0];
    expect(typeof recall.id).toBe("string");
    expect(recall.id.length).toBeGreaterThan(0);
    expect(recall.recallNumber).toBe("");
    expect(recall.eventId).toBe("");
    expect(recall.productDescription).toBe(product.product_description);
    expect(recall.country).toBe("");
    expect(recall.classification).toBe("Unknown");
    expect(recall.status).toBe("Unknown");
  });
});
