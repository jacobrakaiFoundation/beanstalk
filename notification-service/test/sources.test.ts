import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { enrichFromAnnouncement, HttpFdaSource } from "../src/sources.js";
import { storedNotice } from "./helpers.js";

const fixture = readFileSync(fileURLToPath(new URL("./fixtures/fda-announcement.html", import.meta.url)), "utf8");

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

  it("uses Product Type as the authoritative food classifier", () => {
    const notice = storedNotice("not-food", "2026-09-11T22:15:00.000Z", "Looks like food");
    const html = fixture.replace("Food &amp; Beverages<br>Allergens", "Drugs");
    expect(enrichFromAnnouncement(notice, { html, finalURL: notice.canonicalURL }).foodClassification).toBe("unknown");
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
