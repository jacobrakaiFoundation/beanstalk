import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { boundedText, ENRICHED_TEXT_LIMIT, enrichFromAnnouncement, HttpFdaSource, parseAnnualDocument, readableTableLines } from "../src/sources.js";
import { annual, storedNotice } from "./helpers.js";

const fixture = readFileSync(fileURLToPath(new URL("./fixtures/fda-announcement.html", import.meta.url)), "utf8");

const gfBlendsFixture = readFileSync(
  fileURLToPath(new URL("./fixtures/fda-announcement-gf-blends.html", import.meta.url)),
  "utf8",
);

describe("FDA announcement enrichment", () => {
  it("preserves full official wording and supported structured fields", () => {
    const notice = storedNotice("whole-foods", "2026-09-11T22:15:00.000Z", "Truncated RSS title");
    notice.summary = "Truncated RSS description";
    const enriched = enrichFromAnnouncement(notice, { html: fixture, finalURL: notice.canonicalURL });
    expect(enriched.title).toContain("Whole Foods Market Issues Allergy Alert");
    expect(enriched.summary).toContain("People with an egg allergy risk a serious reaction");
    expect(enriched.summary).toContain("No illnesses have been reported");
    expect(enriched.summary).not.toContain("This text must not enter");
    expect(enriched).toMatchObject({
      productDescription: "Cheese",
      reasonForRecall: "Undeclared Egg",
      companyName: "Whole Foods Market",
      foodClassification: "food",
    });
    expect(enriched.codeInfo).toContain("PLU");
    expect(enriched.codeInfo).toContain("57953");
    expect(enriched.codeInfo).toContain("10/7/2026");
    expect(enriched.distribution).toContain("Arizona");
  });

  it("renders an FDA products table as labelled lines with blank lines between paragraphs", () => {
    // The 2026-09-17 GF Blends announcement: paragraphs, a "Products Affected"
    // heading, then a Brand | Product | Lot Number | Best-By Dates table. On a
    // phone the old output ran every paragraph together and showed the table
    // as pipe-separated rows the reader had to line up against a header by eye.
    const notice = storedNotice(
      "gf-blends-recalls-truly-aip-all-purpose-flour-and-bread-mix-and-eat-gangster-flat-bread-pizza-mix",
      "2026-09-17T00:00:00.000Z",
      "RSS title",
    );
    const enriched = enrichFromAnnouncement(notice, { html: gfBlendsFixture, finalURL: notice.canonicalURL });
    expect(enriched.summary).not.toContain(" | ");
    expect(enriched.summary).toContain("\n\nProducts Affected\n\n");
    expect(enriched.summary).toContain(
      "Brand: Truly AIP · Product: All Purpose Flour 15.3 oz · Lot Number: 260225 · Best-By Dates: 2-25-28",
    );
    expect(enriched.summary).toContain("Lot Number: 260803");
    expect(enriched.summary).not.toMatch(/^Brand \| Product/mu);
    expect(enriched.codeInfo).toContain("Lot Number: 260617 · Best-By Dates: 12-17-27");
    expect(enriched.codeInfo).not.toContain(" | ");
    // Every paragraph is separated by a blank line: no two non-empty lines are adjacent
    // except inside the products table, whose rows stay one per line.
    const paragraphs = enriched.summary.split("\n\n");
    expect(paragraphs.length).toBeGreaterThanOrEqual(6);
    expect(enriched).toMatchObject({ companyName: "GF Blends", foodClassification: "food" });
  });

  it("emits a nested table's rows once", () => {
    const notice = storedNotice("nested", "2026-09-11T22:15:00.000Z", "Nested");
    const html = fixture.replace(
      "<tbody><tr><td>Cabricharme Raw Milk Cheese</td>",
      "<tbody><tr><td><table><tr><td>Cabricharme Raw Milk Cheese</td></tr></table></td>",
    );
    const enriched = enrichFromAnnouncement(notice, { html, finalURL: notice.canonicalURL });
    expect(enriched.summary.match(/Cabricharme Raw Milk Cheese/gu)).toHaveLength(1);
  });

  it("uses Product Type as the authoritative food classifier", () => {
    const notice = storedNotice("not-food", "2026-09-11T22:15:00.000Z", "Looks like food");
    const html = fixture.replace("Food &amp; Beverages<br>Allergens", "Drugs");
    expect(enrichFromAnnouncement(notice, { html, finalURL: notice.canonicalURL }).foodClassification).toBe("unknown");
  });

  it("preserves prose and table cells in document order inside one minified wrapper", () => {
    const notice = storedNotice("wrapped-food", "2026-09-11T22:15:00.000Z");
    const html = fixture
      .replace('</h2>\n    <p>Whole Foods', '</h2><div class="field--item"><p>Whole Foods')
      .replace("</body>", "</div></body>")
      .replace(/>\s+</gu, "><");
    const enriched = enrichFromAnnouncement(notice, { html, finalURL: notice.canonicalURL });
    expect(enriched.summary).toContain("People with an egg allergy risk a serious reaction.");
    expect(enriched.summary).toContain("Consumers should destroy the affected product.");
    expect(enriched.summary).toContain(
      "Product Description: Cabricharme Raw Milk Cheese · PLU: 57953 · States: California, New Jersey · Best By Dates: Through 10/7/2026",
    );
    expect(enriched.summary.indexOf("serious reaction")).toBeLessThan(enriched.summary.indexOf("57953"));
    expect(enriched.summary.indexOf("57953")).toBeLessThan(enriched.summary.indexOf("Consumers should destroy"));
    expect(enriched.summary).not.toContain("This text must not enter");
    expect(enriched.summary.match(/57953/gu)).toHaveLength(1);
    expect(enriched.codeInfo).toContain("57953");
    expect(enriched.distribution).toContain("Arizona");
  });

  it("fails safe when an official Food Product Type conflicts with plainly non-food wording", () => {
    const notice = storedNotice(
      "misclassified-injection",
      "2026-09-11T22:15:00.000Z",
      "Recall of Epinephrine Injection, USP",
    );
    const html = fixture.replace(
      "Whole Foods Market Issues Allergy Alert on Undeclared Egg in Cabricharme Cheese",
      "Recall of Epinephrine Injection, USP",
    );
    expect(enrichFromAnnouncement(notice, { html, finalURL: notice.canonicalURL }).foodClassification).toBe("unknown");
  });

  it("rejects a redirect that changes the recall canonical identity", () => {
    const notice = storedNotice("original", "2026-09-11T22:15:00.000Z");
    expect(() =>
      enrichFromAnnouncement(notice, {
        html: fixture,
        finalURL: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/different",
      }),
    ).toThrow("different canonical URL");
  });
});

describe("annual continuity identifiers", () => {
  it("retains official non-food URLs for continuity without importing them as food", () => {
    const xml = annual([{ slug: "drug-cursor", date: "09/11/2026" }])
      .replace("Food &amp; Beverages, Foodborne Illness", "Drugs");
    expect(parseAnnualDocument(xml, "2026-09-13T20:00:00.000Z")).toEqual({
      foodNotices: [],
      canonicalURLs: ["https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/drug-cursor"],
    });
  });

  it("rejects unverified URLs even when their path matches a previous cursor", () => {
    const xml = annual([{ slug: "cursor", date: "09/11/2026" }]).replace("www.fda.gov", "example.com");
    expect(() => parseAnnualDocument(xml, "2026-09-13T20:00:00.000Z")).toThrow("no valid official recall URLs");
  });
});

describe("bounded FDA fetching", () => {
  it("rejects redirects away from the HTTPS FDA origin", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.com/recall" } }));
    const source = new HttpFdaSource();
    await expect(
      source.fetchAnnouncement("https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/example"),
    ).rejects.toThrow("HTTPS on fda.gov");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it("rejects non-default ports before making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const source = new HttpFdaSource();
    await expect(source.fetchAnnouncement("https://www.fda.gov:8443/example")).rejects.toThrow("HTTPS on fda.gov");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("cancels a chunked announcement as soon as its streamed body exceeds the byte limit", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        controller.enqueue(new Uint8Array(3 * 1024 * 1024));
      },
      cancel() {
        canceled = true;
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status: 200 }));
    const source = new HttpFdaSource();
    await expect(
      source.fetchAnnouncement("https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/example"),
    ).rejects.toThrow("size limit");
    expect(canceled).toBe(true);
    fetchMock.mockRestore();
  });
});

describe("boundedText", () => {
  it("leaves a real announcement whole and cuts a pathological one on a word boundary with a note", () => {
    const real = "word ".repeat(500).trim();
    expect(boundedText(real)).toBe(real);
    const huge = "lot 260225 ".repeat(5_000);
    const bounded = boundedText(huge);
    expect(bounded.length).toBeLessThanOrEqual(ENRICHED_TEXT_LIMIT);
    expect(bounded).toMatch(/\S\n\n\[Text shortened; the full notice is at the FDA link\.\]$/u);
  });
});

describe("readableTableLines", () => {
  it("keeps a blank cell in its column so labels never shift onto the wrong value", () => {
    expect(
      readableTableLines([
        { cells: ["Brand", "Product", "Lot Number", "Best-By Dates"], headerCells: true },
        { cells: ["", "All Purpose Flour", "260225", "2-25-28"], headerCells: false },
        { cells: ["", "", "", ""], headerCells: false },
      ]),
    ).toEqual(["Product: All Purpose Flour · Lot Number: 260225 · Best-By Dates: 2-25-28"]);
  });

  it("labels cells from a th header row", () => {
    expect(
      readableTableLines([
        { cells: ["Lot", "Best by"], headerCells: true },
        { cells: ["260225", "2-25-28"], headerCells: false },
      ]),
    ).toEqual(["Lot: 260225 · Best by: 2-25-28"]);
  });

  it("treats a short digit-free first td row as the header, as FDA often marks it", () => {
    expect(
      readableTableLines([
        { cells: ["Brand", "Product"], headerCells: false },
        { cells: ["Truly AIP", "Bread Mix 14 oz"], headerCells: false },
      ]),
    ).toEqual(["Brand: Truly AIP · Product: Bread Mix 14 oz"]);
  });

  it("keeps a header-less table of digit-free product rows as plain rows, losing no product", () => {
    expect(
      readableTableLines([
        { cells: ["Truly AIP", "Bread Mix"], headerCells: false },
        { cells: ["Truly AIP", "Flour"], headerCells: false },
      ]),
    ).toEqual(["Truly AIP · Bread Mix", "Truly AIP · Flour"]);
  });

  it("keeps a single-row or digit-bearing table as plain cells and never drops a cell", () => {
    expect(readableTableLines([{ cells: ["UPC 0 12345 67890 1", "Sold in AZ"], headerCells: false }])).toEqual([
      "UPC 0 12345 67890 1 · Sold in AZ",
    ]);
    expect(
      readableTableLines([
        { cells: ["Lot", "Best by"], headerCells: true },
        { cells: ["260225", "2-25-28", "extra cell"], headerCells: false },
      ]),
    ).toEqual(["260225 · 2-25-28 · extra cell"]);
    expect(readableTableLines([])).toEqual([]);
  });
});
