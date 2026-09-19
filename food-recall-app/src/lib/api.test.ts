import { beforeEach, describe, expect, it, vi } from "vitest";

function urlHostname(url: unknown): string {
  try {
    return new URL(String(url), "https://placeholder.invalid").hostname;
  } catch {
    return "";
  }
}

function isFdaApiUrl(url: unknown): boolean {
  return urlHostname(url) === "api.fda.gov";
}

function isFsisProxyUrl(url: unknown): boolean {
  try {
    return new URL(String(url), "https://placeholder.invalid").pathname.includes("/api/fsis-recalls");
  } catch {
    return false;
  }
}

import {
  buildCacheKey,
  buildGroupedSearchClause,
  buildSearchParam,
  clearCache,
  fetchFsisRecalls,
  fetchRecalls,
  sanitizeSearchQuery,
} from "./api";

describe("sanitizeSearchQuery", () => {
  it("strips quotes and backslashes", () => {
    expect(sanitizeSearchQuery('M&M "test"')).toBe("M&M test");
    expect(sanitizeSearchQuery("a\\b")).toBe("ab");
  });
  it("preserves & and # for encoding", () => {
    expect(sanitizeSearchQuery("M&M")).toBe("M&M");
    expect(sanitizeSearchQuery("a#b")).toBe("a#b");
  });
});

describe("buildGroupedSearchClause", () => {
  it("groups cross-field OR in parentheses", () => {
    expect(buildGroupedSearchClause("milk")).toBe(
      '(product_description:"milk" OR reason_for_recall:"milk" OR recalling_firm:"milk")',
    );
  });
  it("handles multiword input", () => {
    expect(buildGroupedSearchClause("ice cream")).toBe(
      '(product_description:"ice cream" OR reason_for_recall:"ice cream" OR recalling_firm:"ice cream")',
    );
  });
  it("returns null for empty", () => {
    expect(buildGroupedSearchClause("")).toBeNull();
    expect(buildGroupedSearchClause("   ")).toBeNull();
  });
  it("encodes safely via encodeURIComponent (ampersand)", () => {
    const clause = buildGroupedSearchClause("M&M")!;
    const encoded = encodeURIComponent(clause);
    expect(encoded).toContain("%26");
    expect(encoded).not.toContain("&search=");
    // Full URL would be ?search=<encoded> so & does not split params
    const url = `https://api.fda.gov/food/enforcement.json?limit=6&skip=0&search=${encoded}`;
    expect(url.split("&search=").length).toBe(2);
    // hash is encoded, not fragment
    const hashEncoded = encodeURIComponent(buildGroupedSearchClause("a#b")!);
    expect(hashEncoded).toContain("%23");
  });
});

describe("buildSearchParam", () => {
  it("composes predicates outside grouped OR via AND", () => {
    const param = buildSearchParam("milk", ['classification:"Class I"']);
    expect(param).toBe(
      '(product_description:"milk" OR reason_for_recall:"milk" OR recalling_firm:"milk") AND classification:"Class I"',
    );
  });
  it("handles no search with predicates", () => {
    expect(buildSearchParam("", ['status:"Ongoing"'])).toBe('status:"Ongoing"');
  });
  it("returns null when empty", () => {
    expect(buildSearchParam("")).toBeNull();
  });
});

describe("product/hazard/firm fixtures", () => {
  // Deterministic fixtures: each field uniquely matches
  const fixtures = [
    { product_description: "UNIQUE_PRODUCT_XYZ", reason_for_recall: "other", recalling_firm: "other" },
    { product_description: "other", reason_for_recall: "UNIQUE_HAZARD_ABC - Salmonella", recalling_firm: "other" },
    { product_description: "other", reason_for_recall: "other", recalling_firm: "UNIQUE_FIRM_123" },
  ];
  it("grouped clause matches product-only record via product_description", () => {
    const clause = buildGroupedSearchClause("UNIQUE_PRODUCT_XYZ")!;
    expect(clause).toContain('product_description:"UNIQUE_PRODUCT_XYZ"');
    // Simulate FDA matching: at least one field contains term
    const match = (f: (typeof fixtures)[0]) => Object.values(f).some((v) => v.includes("UNIQUE_PRODUCT_XYZ"));
    expect(fixtures.filter(match).length).toBe(1);
  });
  it("grouped clause matches hazard-only record via reason_for_recall", () => {
    const clause = buildGroupedSearchClause("UNIQUE_HAZARD_ABC")!;
    expect(clause).toContain('reason_for_recall:"UNIQUE_HAZARD_ABC"');
    const match = (f: (typeof fixtures)[0]) => Object.values(f).some((v) => v.includes("UNIQUE_HAZARD_ABC"));
    expect(fixtures.filter(match).length).toBe(1);
  });
  it("grouped clause matches firm-only record via recalling_firm", () => {
    const clause = buildGroupedSearchClause("UNIQUE_FIRM_123")!;
    expect(clause).toContain('recalling_firm:"UNIQUE_FIRM_123"');
    const match = (f: (typeof fixtures)[0]) => Object.values(f).some((v) => v.includes("UNIQUE_FIRM_123"));
    expect(fixtures.filter(match).length).toBe(1);
  });
});

describe("fetchRecalls — no synthetic fallback", () => {
  beforeEach(() => {
    clearCache();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const mockSuccess = (
    results: unknown[] = [
      {
        recall_number: "F-1",
        product_description: "Real",
        reason_for_recall: "Hazard",
        classification: "Class I",
        status: "Ongoing",
        recalling_firm: "Firm",
        distribution_pattern: "CA",
      },
    ],
  ) =>
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ results, meta: { results: { total: results.length } } }) });

  it("startup without cache and with success returns live data, not mock", async () => {
    vi.stubGlobal("fetch", mockSuccess());
    const res = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(res.recalls.length).toBe(1);
    expect(res.error).toBeNull();
    expect(res.isDemo).toBe(false);
    expect(res.recalls[0].productDescription).toBe("Real");
  });

  it("404 NOT_FOUND yields empty, not mock, no error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: "NOT_FOUND", message: "No matches found!" } }),
      }),
    );
    const res = await fetchRecalls({ search: "nomatch123", limit: 6, skip: 0 });
    expect(res.recalls).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.error).toBeNull();
    expect(res.isStale).toBe(false);
  });

  it("offline (rejected fetch) returns NETWORK error, empty, retryable, no mock", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    const res = await fetchRecalls({ search: "milk", limit: 6, skip: 0 });
    expect(res.recalls).toEqual([]);
    expect(res.error?.code).toBe("NETWORK");
    expect(res.error?.retryable).toBe(true);
    expect(res.isStale).toBe(false);
    // Ensure Fresh Pasta Co mock not leaked
    expect(res.recalls.find((r) => r.recallingFirm === "Fresh Pasta Co")).toBeUndefined();
  });

  it("timeout via AbortError returns TIMEOUT", async () => {
    const abortErr = new DOMException("Aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));
    const res = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(res.error?.code).toBe("TIMEOUT");
    expect(res.error?.retryable).toBe(true);
  });

  it("429 rate limit returns RATE_LIMIT and stale if cached", async () => {
    // First, populate cache with success
    vi.stubGlobal("fetch", mockSuccess());
    const first = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(first.error).toBeNull();
    // Now 429
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: { message: "Rate limited" } }) }),
    );
    const res = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(res.error?.code).toBe("RATE_LIMIT");
    expect(res.isStale).toBe(true);
    expect(res.recalls.length).toBe(1);
  });

  it("503 server failure returns SERVER, retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "Service Unavailable" } }),
      }),
    );
    const res = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(res.error?.code).toBe("SERVER");
    expect(res.error?.retryable).toBe(true);
    expect(res.recalls).toEqual([]);
  });

  it("400 bad request returns BAD_REQUEST, not retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid parameter" } }) }),
    );
    const res = await fetchRecalls({ search: "M&M", limit: 6, skip: 0 });
    expect(res.error?.code).toBe("BAD_REQUEST");
    expect(res.error?.retryable).toBe(false);
  });

  it("malformed payload returns MALFORMED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ meta: {} }) })); // missing results
    const res = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(res.error?.code).toBe("MALFORMED");
  });

  it("recovery after failure returns live data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const fail = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(fail.error).not.toBeNull();
    vi.stubGlobal(
      "fetch",
      mockSuccess([
        {
          recall_number: "F-2",
          product_description: "Recovered",
          reason_for_recall: "X",
          classification: "Class I",
          status: "Ongoing",
          recalling_firm: "Firm",
          distribution_pattern: "",
        },
      ]),
    );
    const rec = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(rec.error).toBeNull();
    expect(rec.recalls[0].productDescription).toBe("Recovered");
  });

  it("demo mode returns conspicuously fictional data", async () => {
    // Enable demo via query
    const url = new URL(window.location.href);
    url.searchParams.set("demo", "1");
    window.history.replaceState({}, "", url.toString());
    vi.stubGlobal("fetch", mockSuccess()); // should not be called
    const res = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(res.isDemo).toBe(true);
    expect(res.recalls[0].productDescription.startsWith("DEMO — Fictional")).toBe(true);
    expect(res.recalls[0].recallNumber.startsWith("DEMO-")).toBe(true);
    // cleanup
    url.searchParams.delete("demo");
    window.history.replaceState({}, "", url.toString());
  });

  it("aborted signal returns early and does not use cache mock", async () => {
    const controller = new AbortController();
    controller.abort();
    const res = await fetchRecalls({ search: "", limit: 6, skip: 0, signal: controller.signal });
    expect(res.error?.message).toBe("Aborted");
    expect(res.recalls).toEqual([]);
  });

  it("preserves more_code_info without truncation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              recall_number: "F-2258-2016",
              code_info: "a".repeat(32600),
              more_code_info: "Lots 8L5M30, " + "x".repeat(9130),
              product_description: "Test",
              reason_for_recall: "X",
              classification: "Class I",
              status: "Ongoing",
              recalling_firm: "Firm",
              distribution_pattern: "",
            },
          ],
          meta: { results: { total: 1 } },
        }),
      }),
    );
    const res = await fetchRecalls({ search: "F-2258-2016", limit: 6, skip: 0 });
    expect(res.recalls[0].codeInfo.length).toBe(32600);
    expect(res.recalls[0].moreCodeInfo).toContain("8L5M30");
    expect(res.recalls[0].moreCodeInfo.length).toBeGreaterThan(9000);
    // Regression: lot only in more_code_info is searchable via mock? No, but preserved
  });

  it("out-of-order: second request wins, first stale ignored via caller generation (simulated)", async () => {
    // Simulate two overlapping fetches where first is slower
    let firstResolve: (v: Response) => void;
    const firstPromise = new Promise<Response>((r) => {
      firstResolve = r;
    });
    const secondPromise = Promise.resolve({
      ok: true,
      json: async () => ({
        results: [
          {
            recall_number: "F-2",
            product_description: "Second",
            reason_for_recall: "X",
            classification: "Class I",
            status: "Ongoing",
            recalling_firm: "Firm",
            distribution_pattern: "",
          },
        ],
        meta: { results: { total: 1 } },
      }),
    } as Response);
    const fsisEmpty = { ok: true, json: async () => [] };
    let fdaCallCount = 0;
    const fetchMock = vi.fn((url: unknown) => {
      // FSIS side-fetch resolves to an empty API response; FDA calls keep their queued order
      if (isFsisProxyUrl(url)) return Promise.resolve(fsisEmpty);
      fdaCallCount += 1;
      return fdaCallCount === 1 ? firstPromise : secondPromise;
    });
    vi.stubGlobal("fetch", fetchMock);
    // Start first
    const p1 = fetchRecalls({ search: "first", limit: 6, skip: 0 });
    // Start second before first resolves
    const p2 = fetchRecalls({ search: "second", limit: 6, skip: 0 });
    firstResolve!({
      ok: true,
      json: async () => ({
        results: [
          {
            recall_number: "F-1",
            product_description: "First",
            reason_for_recall: "X",
            classification: "Class I",
            status: "Ongoing",
            recalling_firm: "Firm",
            distribution_pattern: "",
          },
        ],
        meta: { results: { total: 1 } },
      }),
    } as Response);
    const [r1, r2] = await Promise.all([p1, p2]);
    // Both resolve, caller would use generation to keep second
    expect(r1.recalls[0].productDescription).toBe("First");
    expect(r2.recalls[0].productDescription).toBe("Second");
    // Verify FDA fetch called twice with different search params (excluding FSIS side-fetch)
    const fdaUrls = fetchMock.mock.calls.map((call) => String(call[0])).filter((u) => !isFsisProxyUrl(u));
    expect(fdaUrls).toHaveLength(2);
    expect(fdaUrls[0]).toContain("first");
    expect(fdaUrls[1]).toContain("second");
  });

  it("fetchFsisRecalls maps FSIS API records to Recall in dev", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            field_title: "Acme Foods Recalls Contaminated Widgets",
            field_recall_number: "001-2026",
            field_recall_url: "http://www.fsis.usda.gov/recalls-alerts/acme",
            field_recall_type: "Active Recall",
            field_recall_classification: "Class I",
            field_recall_reason: ["Product Contamination"],
            field_recall_date: "2026-01-15",
            field_states: ["Texas"],
            field_establishment: ["Est. 123"],
            field_product_items: "10-lb boxes",
            field_summary: "<p>Summary.</p>",
            field_archive_recall: "False",
          },
        ],
      }),
    );
    const recalls = await fetchFsisRecalls();
    expect(recalls.length).toBe(1);
    expect(recalls[0].id).toBe("FSIS-001-2026");
    expect(recalls[0].source).toBe("USDA-FSIS");
    expect(recalls[0].classification).toBe("Class I");
    expect(recalls[0].recallingFirm).toBe("Acme Foods");
    expect(recalls[0].establishmentNumber).toBe("Est. 123");
  });

  it("fetchFsisRecalls drops archived raw API records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            field_title: "Old Firm Recalls Old Product",
            field_recall_number: "099-2020",
            field_recall_url: "http://www.fsis.usda.gov/recalls-alerts/old",
            field_recall_type: "Closed Recall",
            field_recall_classification: "Class II",
            field_recall_reason: ["Misbranding"],
            field_recall_date: "2020-01-15",
            field_states: ["Texas"],
            field_archive_recall: "True",
          },
          {
            field_title: "Acme Foods Recalls Contaminated Widgets",
            field_recall_number: "001-2026",
            field_recall_url: "http://www.fsis.usda.gov/recalls-alerts/acme",
            field_recall_type: "Active Recall",
            field_recall_classification: "Class I",
            field_recall_reason: ["Product Contamination"],
            field_recall_date: "2026-01-15",
            field_states: ["Texas"],
            field_archive_recall: "False",
          },
        ],
      }),
    );
    const recalls = await fetchFsisRecalls();
    expect(recalls.map((r) => r.id)).toEqual(["FSIS-001-2026"]);
  });
});

describe("distribution: bounded state recognition and nationwide", () => {
  it("matches correctly", async () => {
    const { matchesDistributionPattern, isDistributionUnclear } = await import("./api");
    expect(matchesDistributionPattern("CA, AZ", "CA")).toBe(true);
    expect(matchesDistributionPattern("CA, AZ", "NJ")).toBe(false);
    expect(matchesDistributionPattern("CA, AZ, TX, NM", "TX")).toBe(true);
    expect(matchesDistributionPattern("CA, AZ, TX", "NY")).toBe(false);
    expect(matchesDistributionPattern("Nationwide - retail", "CA")).toBe(true);
    expect(matchesDistributionPattern("Nationwide", "IN")).toBe(true);
    expect(matchesDistributionPattern("national distribution", "CA")).toBe(true);
    expect(isDistributionUnclear("")).toBe(true);
    expect(matchesDistributionPattern("", "CA")).toBe(false);
    expect(isDistributionUnclear("Direct to consumer")).toBe(true);
    expect(matchesDistributionPattern("Indiana", "IN")).toBe(true);
    expect(matchesDistributionPattern("IN, CA", "IN")).toBe(true);
    expect(matchesDistributionPattern("Virginia", "IN")).toBe(false);
    expect(matchesDistributionPattern("Distribution in Indiana", "IN")).toBe(true);
    expect(matchesDistributionPattern("Distribution in Virginia", "IN")).toBe(false);
    expect(matchesDistributionPattern("unrelated text with in inside", "IN")).toBe(false);
    expect(matchesDistributionPattern("California, Arizona", "CA")).toBe(true);
    expect(matchesDistributionPattern("California distribution", "CA")).toBe(true);
    expect(matchesDistributionPattern("CA", "CA")).toBe(true);
  });
});

describe("buildCacheKey — collision-free", () => {
  it("pipe in search term does not collide with separate classification field", () => {
    // "milk|Class II" as search + no classification vs "milk" + classification "Class II"
    const keyA = buildCacheKey("milk|Class II", "", "", "", [], 20, 0, "", "");
    const keyB = buildCacheKey("milk", "Class II", "", "", [], 20, 0, "", "");
    expect(keyA).not.toBe(keyB);
  });

  it("unsorted dietary arrays produce the same cache key", () => {
    const keyAB = buildCacheKey("", "", "", "", ["milk", "eggs"], 20, 0, "", "");
    const keyBA = buildCacheKey("", "", "", "", ["eggs", "milk"], 20, 0, "", "");
    expect(keyAB).toBe(keyBA);
  });

  it("identical inputs produce identical keys", () => {
    const a = buildCacheKey("milk", "Class I", "Ongoing", "CA", ["gluten"], 10, 5, "Pathogen", "");
    const b = buildCacheKey("milk", "Class I", "Ongoing", "CA", ["gluten"], 10, 5, "Pathogen", "");
    expect(a).toBe(b);
  });

  it("different skip or limit produce different keys", () => {
    const a = buildCacheKey("milk", "", "", "", [], 20, 0, "", "");
    const b = buildCacheKey("milk", "", "", "", [], 20, 20, "", "");
    expect(a).not.toBe(b);
  });

  it("hazard category is part of the key", () => {
    const a = buildCacheKey("", "", "", "", [], 20, 0, "", "");
    const b = buildCacheKey("", "", "", "", [], 20, 0, "Pathogen", "");
    expect(a).not.toBe(b);
  });

  it("sanitizes search query inside the key (strips quotes/backslashes)", () => {
    const key = buildCacheKey('M&M "test"', "", "", "", [], 20, 0, "", "");
    expect(key).not.toContain('"test"');
    expect(key).toContain("M&M test");
  });

  it("source is part of the cache key", () => {
    const fdaKey = buildCacheKey("milk", "", "", "", [], 20, 0, "", "");
    const fsisKey = buildCacheKey("milk", "", "", "", [], 20, 0, "", "USDA-FSIS");
    expect(fdaKey).not.toBe(fsisKey);
  });

  it("searchAfter cursor is part of the cache key", () => {
    const skipKey = buildCacheKey("milk", "", "", "", [], 20, 0, "", "");
    const cursorKey = buildCacheKey("milk", "", "", "", [], 20, 0, "", "", "0=token");
    expect(skipKey).not.toBe(cursorKey);
  });
});

describe("fetchRecalls — source filter", () => {
  beforeEach(() => {
    clearCache();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("FDA-only returns only FDA recalls", async () => {
    const fdaResults = [
      {
        recall_number: "F-FDA-1",
        product_description: "FDA Product",
        reason_for_recall: "Hazard",
        classification: "Class I",
        status: "Ongoing",
        recalling_firm: "FDA Firm",
        distribution_pattern: "CA",
      },
    ];
    const fsisData = [
      {
        field_title: "FSIS Firm Recalls Product",
        field_recall_number: "001-2026",
        field_recall_url: "http://www.fsis.usda.gov/test",
        field_recall_type: "Active Recall",
        field_recall_classification: "Class I",
        field_recall_reason: ["Product Contamination"],
        field_recall_date: "2026-01-15",
        field_states: ["Texas"],
        field_archive_recall: "False",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        if (isFsisProxyUrl(url)) {
          return Promise.resolve({ ok: true, json: async () => fsisData });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: fdaResults, meta: { results: { total: 1 } } }),
        });
      }),
    );
    const result = await fetchRecalls({ limit: 20, skip: 0, source: "FDA" });
    expect(result.error).toBeNull();
    expect(result.recalls.every((r) => r.source === "FDA")).toBe(true);
  });

  it("FSIS-only returns only FSIS recalls", async () => {
    const fdaResults = [
      {
        recall_number: "F-FDA-1",
        product_description: "FDA Product",
        reason_for_recall: "Hazard",
        classification: "Class I",
        status: "Ongoing",
        recalling_firm: "FDA Firm",
        distribution_pattern: "CA",
      },
    ];
    const fsisData = [
      {
        field_title: "FSIS Firm Recalls Product",
        field_recall_number: "001-2026",
        field_recall_url: "http://www.fsis.usda.gov/test",
        field_recall_type: "Active Recall",
        field_recall_classification: "Class I",
        field_recall_reason: ["Product Contamination"],
        field_recall_date: "2026-01-15",
        field_states: ["Texas"],
        field_archive_recall: "False",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        if (isFsisProxyUrl(url)) {
          return Promise.resolve({ ok: true, json: async () => fsisData });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: fdaResults, meta: { results: { total: 1 } } }),
        });
      }),
    );
    const result = await fetchRecalls({ limit: 20, skip: 0, source: "USDA-FSIS" });
    expect(result.error).toBeNull();
    expect(result.recalls.every((r) => r.source === "USDA-FSIS")).toBe(true);
  });

  it("paginates FSIS-only results instead of emptying later pages", async () => {
    const fsisData = [1, 2, 3].map((n) => ({
      field_title: `FSIS Firm Recalls Product ${n}`,
      field_recall_number: `00${n}-2026`,
      field_recall_url: `http://www.fsis.usda.gov/test-${n}`,
      field_recall_type: "Active Recall",
      field_recall_classification: "Class I",
      field_recall_reason: ["Product Contamination"],
      field_recall_date: `2026-01-0${n}`,
      field_states: ["Texas"],
      field_archive_recall: "False",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        if (isFsisProxyUrl(url)) return Promise.resolve({ ok: true, json: async () => fsisData });
        throw new Error(`unexpected FDA fetch: ${String(url)}`);
      }),
    );
    const page1 = await fetchRecalls({ limit: 2, skip: 0, source: "USDA-FSIS" });
    const page2 = await fetchRecalls({ limit: 2, skip: 2, source: "USDA-FSIS" });
    expect(page1.recalls).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page2.recalls).toHaveLength(1);
    expect(page2.total).toBe(3);
  });

  it("does not hide an openFDA error behind FSIS rows", async () => {
    const fsisData = [
      {
        field_title: "FSIS Firm Recalls Product",
        field_recall_number: "001-2026",
        field_recall_url: "http://www.fsis.usda.gov/test",
        field_recall_type: "Active Recall",
        field_recall_classification: "Class I",
        field_recall_reason: ["Product Contamination"],
        field_recall_date: "2026-01-15",
        field_states: ["Texas"],
        field_archive_recall: "False",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        if (isFsisProxyUrl(url)) return Promise.resolve({ ok: true, json: async () => fsisData });
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: { message: "FDA down" } }),
        });
      }),
    );
    const result = await fetchRecalls({ limit: 20, skip: 0 });
    expect(result.error?.code).toBe("SERVER");
    expect(result.recalls).toHaveLength(0);
  });

  it("prefixes FSIS on page 0 without inflating the FDA total", async () => {
    const fdaResults = [
      {
        recall_number: "F-FDA-1",
        product_description: "FDA Product",
        reason_for_recall: "Hazard",
        classification: "Class I",
        status: "Ongoing",
        recalling_firm: "FDA Firm",
        distribution_pattern: "CA",
        recall_initiation_date: "20260101",
      },
    ];
    const fsisData = [
      {
        field_title: "FSIS Firm Recalls Product",
        field_recall_number: "001-2026",
        field_recall_url: "http://www.fsis.usda.gov/test",
        field_recall_type: "Active Recall",
        field_recall_classification: "Class I",
        field_recall_reason: ["Product Contamination"],
        field_recall_date: "2026-01-15",
        field_states: ["Texas"],
        field_archive_recall: "False",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        if (isFsisProxyUrl(url)) return Promise.resolve({ ok: true, json: async () => fsisData });
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: fdaResults, meta: { results: { total: 40 } } }),
        });
      }),
    );
    const result = await fetchRecalls({ limit: 1, skip: 0 });
    expect(result.error).toBeNull();
    expect(result.total).toBe(40);
    expect(result.recalls.some((r) => r.source === "USDA-FSIS")).toBe(true);
    expect(result.recalls.some((r) => r.source === "FDA")).toBe(true);
  });
});

describe("fetchRecalls — cache key collision integration", () => {
  beforeEach(() => {
    clearCache();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const mockSuccess = (
    results: unknown[] = [
      {
        recall_number: "F-1",
        product_description: "Real",
        reason_for_recall: "Hazard",
        classification: "Class I",
        status: "Ongoing",
        recalling_firm: "Firm",
        distribution_pattern: "CA",
      },
    ],
  ) =>
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ results, meta: { results: { total: results.length } } }) });

  it("search with pipe in term does not return cached result from separate classification query", async () => {
    // First: fetch with search "milk" + classification "Class II"
    vi.stubGlobal(
      "fetch",
      mockSuccess([
        {
          recall_number: "F-1",
          product_description: "Milk product",
          reason_for_recall: "X",
          classification: "Class II",
          status: "Ongoing",
          recalling_firm: "Firm",
          distribution_pattern: "",
        },
      ]),
    );
    const r1 = await fetchRecalls({ search: "milk", classification: "Class II", limit: 6, skip: 0 });
    expect(r1.recalls.length).toBe(1);

    // Second: fetch with search "milk|Class II" + no classification — should NOT hit cache
    vi.stubGlobal(
      "fetch",
      mockSuccess([
        {
          recall_number: "F-2",
          product_description: "Different product",
          reason_for_recall: "Y",
          classification: "Class I",
          status: "Ongoing",
          recalling_firm: "Other",
          distribution_pattern: "",
        },
      ]),
    );
    const r2 = await fetchRecalls({ search: "milk|Class II", limit: 6, skip: 0 });
    expect(r2.recalls[0].recallNumber).toBe("F-2");
    expect(r2.recalls[0].productDescription).toBe("Different product");
  });

  it("dietary arrays in different order hit the same cache entry (stale fallback)", async () => {
    // First call: populate cache with milk, eggs
    vi.stubGlobal(
      "fetch",
      mockSuccess([
        {
          recall_number: "F-1",
          product_description: "Allergen product",
          reason_for_recall: "X",
          classification: "Class I",
          status: "Ongoing",
          recalling_firm: "Firm",
          distribution_pattern: "",
        },
      ]),
    );
    const r1 = await fetchRecalls({ search: "", dietary: ["milk", "eggs"], limit: 6, skip: 0 });
    expect(r1.recalls.length).toBe(1);

    // Second call with reversed dietary order — simulate network failure
    // Cache key should match, so stale data from first call is returned
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
    const r2 = await fetchRecalls({ search: "", dietary: ["eggs", "milk"], limit: 6, skip: 0 });
    expect(r2.isStale).toBe(true);
    expect(r2.recalls[0].recallNumber).toBe("F-1");
  });
});

describe("SPA static host fallback (#90)", () => {
  beforeEach(() => {
    clearCache();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const goodJsonResponse = {
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({
      results: [
        {
          recall_number: "F-SPA-1",
          product_description: "Direct",
          reason_for_recall: "Hazard",
          classification: "Class I",
          status: "Ongoing",
          recalling_firm: "Firm",
          distribution_pattern: "CA",
        },
      ],
      meta: { results: { total: 1 } },
    }),
  };

  it("non-JSON 200 response (SPA shell) falls back to direct FDA URL", async () => {
    const htmlResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    };
    const fsisEmpty = { ok: true, json: async () => [] };
    const fetchMock = vi.fn((url: unknown) => {
      if (isFsisProxyUrl(url)) return Promise.resolve(fsisEmpty);
      if (isFdaApiUrl(url)) return Promise.resolve(goodJsonResponse);
      return Promise.resolve(htmlResponse);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(res.error).toBeNull();
    expect(res.recalls.length).toBe(1);
    expect(res.recalls[0].productDescription).toBe("Direct");
    // Verify fallback: FSIS side-fetch + proxy (HTML) + direct FDA
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toHaveLength(3);
    expect(
      urls.filter((u) => new URL(u, "https://placeholder.invalid").pathname.includes("/api/food/enforcement.json")),
    ).toHaveLength(1);
    expect(urls.filter((u) => isFdaApiUrl(u))).toHaveLength(1);
  });

  it("JSON parse failure returns MALFORMED, not NETWORK", async () => {
    const badJsonResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(badJsonResponse));

    const res = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(res.error?.code).toBe("MALFORMED");
    expect(res.error?.retryable).toBe(true);
    expect(res.recalls).toEqual([]);
  });

  it("normal JSON 200 response works as before", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(goodJsonResponse));

    const res = await fetchRecalls({ search: "", limit: 6, skip: 0 });
    expect(res.error).toBeNull();
    expect(res.recalls.length).toBe(1);
    expect(res.recalls[0].productDescription).toBe("Direct");
    expect(res.isDemo).toBe(false);
  });
});

describe("openFDA search_after paging", () => {
  const record = {
    recall_number: "F-DEEP",
    product_description: "Deep page",
    reason_for_recall: "X",
    classification: "Class I",
    status: "Ongoing",
    recalling_firm: "Firm",
    distribution_pattern: "",
  };

  it("keeps skip in the request when skip is at the FDA cap", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [record], meta: { results: { total: 30000 } } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchRecalls({ search: "", limit: 6, skip: 25000 });
    const fdaUrls = fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.includes("enforcement"));
    expect(fdaUrls.some((url) => url.includes("skip=25000"))).toBe(true);
    expect(fdaUrls.some((url) => url.includes("search_after"))).toBe(false);
  });

  it("bootstraps search_after from skip=0 when skip exceeds 25000", async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown) => {
      if (isFsisProxyUrl(url)) return Promise.resolve({ ok: true, json: async () => [] });
      const href = String(url);
      const token = href.includes("search_after=") ? "walked" : "from-start";
      const link = `<https://api.fda.gov/food/enforcement.json?search_after=${token}>; rel="next"`;
      return Promise.resolve({
        ok: true,
        headers: { get: (name: string) => (name.toLowerCase() === "link" ? link : null) },
        json: async () => ({ results: [record], meta: { results: { total: 40000 } } }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchRecalls({ search: "", limit: 6, skip: 25006 });
    expect(res.error).toBeNull();
    expect(res.recalls[0].productDescription).toBe("Deep page");
    const fdaUrls = fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.includes("enforcement"));
    expect(fdaUrls.some((url) => /(?:^|[?&])skip=0(?:&|$)/.test(url) && url.includes("limit=1000"))).toBe(true);
    expect(fdaUrls.some((url) => url.includes("search_after="))).toBe(true);
    expect(fdaUrls.every((url) => !url.includes("skip=25000"))).toBe(true);
    expect(res.nextSearchAfter).toBe("walked");
  });

  it("uses a provided searchAfter cursor without skip", async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown) => {
      if (isFsisProxyUrl(url)) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.resolve({
        ok: true,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "link"
              ? '<https://api.fda.gov/food/enforcement.json?search_after=next>; rel="next"'
              : null,
        },
        json: async () => ({ results: [record], meta: { results: { total: 40000 } } }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchRecalls({ search: "", limit: 6, skip: 25006, searchAfter: "given" });
    const fdaUrls = fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.includes("enforcement"));
    expect(fdaUrls.some((url) => url.includes("search_after=given"))).toBe(true);
    expect(fdaUrls.some((url) => /[?&]skip=/.test(url))).toBe(false);
  });
});
