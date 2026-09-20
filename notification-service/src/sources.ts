import { load } from "cheerio";
import type { AnyNode } from "domhandler";
import { XMLParser } from "fast-xml-parser";
import {
  canonicalizeFdaUrl,
  classifyRssItem,
  noticeIdForUrl,
  type StoredNotice,
} from "./domain.js";

export const DEFAULT_RSS_URL =
  "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/food-safety-recalls/rss.xml";
export const DEFAULT_ANNUAL_XML_URL = "https://www.fda.gov/media/191968/download?attachment=";

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
});

function list<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    return text((value as { "#text": unknown })["#text"]);
  }
  return "";
}

function optionalText(value: unknown): string | null {
  const result = text(value);
  return result.length > 0 ? result : null;
}

function isoDate(value: string): string | null {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function annualIsoDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
  if (!match) return isoDate(value);
  const [, month, day, year] = match;
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function verifiedFdaUrl(value: string): { sourceURL: string; canonicalURL: string } | null {
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== "www.fda.gov" && parsed.hostname !== "fda.gov") return null;
    const canonicalURL = canonicalizeFdaUrl(value);
    return { sourceURL: canonicalURL, canonicalURL };
  } catch {
    return null;
  }
}

interface RssItemXml {
  title?: unknown;
  link?: unknown;
  description?: unknown;
  pubDate?: unknown;
  guid?: unknown;
}

interface AnnualItemXml {
  Brand?: unknown;
  Company?: unknown;
  Date?: unknown;
  ProductDescription?: unknown;
  ProductType?: unknown;
  Reason?: unknown;
  Url?: unknown;
  Terminated?: unknown;
}

export interface ParsedRssItem {
  cursorKey: string;
  notice: StoredNotice;
}

interface TableRow {
  cells: string[];
  headerCells: boolean;
}

/**
 * One readable line per table row, so a phone shows "Lot Number: 260225" instead
 * of a pipe-separated row the reader has to line up against a header by eye.
 *
 * FDA marks header rows inconsistently: some announcements use <th>, others a
 * first <td> row of short labels. A first row is treated as the header when it
 * is <th>-only, or when every first-row cell is a short label with no digit in
 * it AND a later row carries a digit (a lot, UPC or date). Without that second
 * condition a header-less table of two products ("Truly AIP | Bread Mix" over
 * "Truly AIP | Flour") would turn its first product into labels and lose it.
 * Each data cell is then written as "Header: value", joined with " · ". Cells
 * keep their column position even when blank, so a blank cell never shifts a
 * lot number under the wrong label; blank cells are simply omitted from the
 * line. Rows whose cell count differs from the header keep their cells in
 * order, joined the same way, so nothing is dropped.
 */
export function readableTableLines(rows: readonly TableRow[]): string[] {
  const filled = rows.filter((row) => row.cells.some(Boolean));
  const first = filled[0];
  if (!first) return [];
  const firstRowIsLabels = first.cells.every((cell) => cell.length <= 40 && !/\d/u.test(cell));
  const laterRowHasDigit = filled.slice(1).some((row) => row.cells.some((cell) => /\d/u.test(cell)));
  const headerLike = first.headerCells || (firstRowIsLabels && laterRowHasDigit);
  const header = headerLike ? first.cells : null;
  const body = headerLike ? filled.slice(1) : filled;
  return body.map((row) => {
    if (header && row.cells.length === header.length) {
      return row.cells
        .map((cell, index) => (cell ? `${header[index]}: ${cell}` : ""))
        .filter(Boolean)
        .join(" · ");
    }
    return row.cells.filter(Boolean).join(" · ");
  });
}

export interface AnnouncementDocument {
  html: string;
  finalURL: string;
}

/**
 * Upper bound on any one enriched text field. Real FDA announcements run
 * 1-3 K characters (the largest fixture, GF Blends 2026-09-17, is 2,346), so
 * this never touches a genuine notice; it only stops a pathological page from
 * storing and serving hundreds of kilobytes per notice. Cut on a word
 * boundary and say so, with the FDA link still on every notice.
 */
export const ENRICHED_TEXT_LIMIT = 16_000;
const SHORTENED_NOTE = "\n\n[Text shortened; the full notice is at the FDA link.]";

export function boundedText(value: string): string {
  if (value.length <= ENRICHED_TEXT_LIMIT) return value;
  const budget = ENRICHED_TEXT_LIMIT - SHORTENED_NOTE.length;
  const cut = value.lastIndexOf(" ", budget);
  return value.slice(0, cut > budget / 2 ? cut : budget).trimEnd() + SHORTENED_NOTE;
}

function normalizedPageText(value: string): string {
  return value.replace(/\u00a0/gu, " ").replace(/[\t\r ]+/gu, " ").replace(/\n\s+/gu, "\n").trim();
}

export function enrichFromAnnouncement(notice: StoredNotice, document: AnnouncementDocument): StoredNotice {
  const finalCanonicalURL = canonicalizeFdaUrl(document.finalURL);
  if (finalCanonicalURL !== notice.canonicalURL) {
    throw new Error("FDA announcement redirected to a different canonical URL");
  }
  const $ = load(document.html);
  const definition = (wantedLabel: string): string | null => {
    let result: string | null = null;
    $("dt").each((_index, element) => {
      const label = normalizedPageText($(element).text()).replace(/:$/u, "");
      if (label !== wantedLabel) return;
      const value = $(element).next("dd");
      const fieldItems = value
        .find(".field--item")
        .map((_itemIndex, item) => normalizedPageText($(item).text()))
        .get()
        .filter(Boolean);
      result = fieldItems.length > 0 ? fieldItems.join(", ") : normalizedPageText(value.text()) || null;
    });
    return result;
  };

  const announcementHeading = $("#recall-announcement").first();
  if (announcementHeading.length !== 1) throw new Error("FDA announcement page is missing #recall-announcement");
  const announcementParts: string[] = [];
  const codeParts: string[] = [];
  const distributionParts: string[] = [];
  const collectAnnouncement = (node: AnyNode): boolean => {
    if (node.type === "text") {
      announcementParts.push(node.data);
      return false;
    }
    if (node.type !== "tag") return false;
    const element = $(node);
    if (element.attr("id") === "recall-photos" ||
        (node.name === "h2" && /^Company Contact Information$/iu.test(normalizedPageText(element.text())))) return true;

    if (node.name === "table") {
      // Rows and cells are scoped to this table and row: a nested table's text
      // is already part of its outer cell, and the collector does not descend
      // into table children, so every cell is emitted exactly once.
      const rows: TableRow[] = element
        .find("tr")
        .filter((_rowIndex, row) => $(row).closest("table").is(element))
        .map((_rowIndex, row) => {
          const cells = $(row)
            .find("th, td")
            .filter((_cellIndex, cell) => $(cell).closest("tr").is(row));
          return {
            cells: cells.map((_cellIndex, cell) => normalizedPageText($(cell).text())).get(),
            headerCells: cells.filter("th").length > 0 && cells.filter("td").length === 0,
          };
        })
        .get();
      const tableRows = readableTableLines(rows);
      const tableText = tableRows.join("\n");
      if (tableText) {
        announcementParts.push(`\n\n${tableText}\n\n`);
        codeParts.push(tableText);
        if (tableRows.some((row) => /\b(state|distribution|location)s?\b/iu.test(row))) distributionParts.push(tableText);
      }
      return false;
    }
    if (node.name === "p" || node.name === "li") {
      const value = normalizedPageText(element.text());
      if (value) {
        if (/\b(lot|code|upc|plu|best by|use by|sell by|expiration|package)\b/iu.test(value)) codeParts.push(value);
        if (/\b(distribut(?:ed|ion)|sold|available|stores?|states?|nationwide|online)\b/iu.test(value)) {
          distributionParts.push(value);
        }
      }
    }
    const block = /^(?:p|li|div|section|article|h[1-6]|ul|ol|blockquote|br)$/u.test(node.name);
    if (block) announcementParts.push("\n\n");
    for (const child of node.children) {
      if (collectAnnouncement(child)) return true;
    }
    if (block) announcementParts.push("\n\n");
    return false;
  };
  let current = announcementHeading.next();
  while (current.length > 0) {
    const node = current[0];
    if (node && collectAnnouncement(node)) break;
    current = current.next();
  }

  // Block boundaries were pushed as "\n\n"; keep them as blank lines (a phone
  // shows paragraphs, not one run-on block) instead of folding them through
  // normalizedPageText, which collapses every newline run to one.
  const summary = announcementParts
    .join("")
    .replace(/\u00a0/gu, " ")
    .replace(/[\t\r ]+/gu, " ")
    .replace(/ ?\n ?/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if (summary.length < 40) throw new Error("FDA announcement page has no usable official announcement text");
  const productType = definition("Product Type");
  if (!productType) throw new Error("FDA announcement page is missing Product Type");
  const title = normalizedPageText($("h1.content-title").first().text()) || notice.title;
  const pageClassifiesFood = /(?:Food\s*&\s*Beverages|Pet Food)/iu.test(productType);
  const contentClassifiesFood = classifyRssItem(title, summary) === "food";
  const foodClassification = pageClassifiesFood && contentClassifiesFood ? "food" : "unknown";
  const unique = (values: string[]): string | null => {
    const deduplicated = [...new Set(values.filter(Boolean))];
    return deduplicated.length > 0 ? boundedText(deduplicated.join("\n\n")) : null;
  };
  return {
    ...notice,
    title,
    summary: boundedText(summary),
    productDescription: definition("Product Description"),
    reasonForRecall: definition("Reason for Announcement"),
    companyName: definition("Company Name"),
    classification: definition("Classification"),
    status: definition("Status"),
    distribution: unique(distributionParts),
    codeInfo: unique(codeParts),
    sourceURL: finalCanonicalURL,
    foodClassification,
  };
}

export function parseRss(xml: string, retrievedAt: string): ParsedRssItem[] {
  const document = parser.parse(xml) as { rss?: { channel?: { item?: RssItemXml | RssItemXml[] } } };
  const items = list(document.rss?.channel?.item);
  const results: ParsedRssItem[] = [];
  for (const item of items) {
    const title = text(item.title);
    const summary = text(item.description);
    const link = text(item.link);
    const guid = optionalText(item.guid);
    const publishedAt = isoDate(text(item.pubDate));
    const verifiedUrl = verifiedFdaUrl(link || guid || "");
    if (!title || !publishedAt || !verifiedUrl) continue;
    const sourceGUID = guid ?? link;
    const cursorKey = verifiedUrl.canonicalURL;
    results.push({
      cursorKey,
      notice: {
        id: noticeIdForUrl(verifiedUrl.canonicalURL),
        title,
        summary,
        productDescription: null,
        reasonForRecall: null,
        companyName: null,
        classification: null,
        status: null,
        distribution: null,
        codeInfo: null,
        publicationDate: publishedAt,
        recallInitiationDate: null,
        retrievedAt,
        sourceURL: verifiedUrl.sourceURL,
        canonicalURL: verifiedUrl.canonicalURL,
        sourceGUID,
        sourceKind: "rss",
        foodClassification: classifyRssItem(title, summary),
        eligibleForAlert: true,
      },
    });
  }
  if (results.length === 0) throw new Error("FDA RSS contained no valid recall items");
  return results;
}

export function parseAnnualDocument(xml: string, retrievedAt: string): { foodNotices: StoredNotice[]; canonicalURLs: string[] } {
  const document = parser.parse(xml) as {
    recallsdata?: { recalls?: AnnualItemXml | AnnualItemXml[] };
  };
  const items = list(document.recallsdata?.recalls);
  const results: StoredNotice[] = [];
  const canonicalURLs = new Set<string>();
  for (const item of items) {
    const url = verifiedFdaUrl(text(item.Url));
    if (!url) continue;
    canonicalURLs.add(url.canonicalURL);
    const productType = text(item.ProductType);
    if (!/(?:Food\s*&\s*Beverages|Pet Food)/iu.test(productType)) continue;
    const publicationDate = annualIsoDate(text(item.Date));
    if (!publicationDate) continue;
    const brand = optionalText(item.Brand);
    const company = optionalText(item.Company);
    const product = optionalText(item.ProductDescription);
    const reason = optionalText(item.Reason);
    const terminated = optionalText(item.Terminated);
    const titleParts = [brand ?? company, product].filter((value): value is string => Boolean(value));
    const title = titleParts.join(" — ") || "FDA food recall";
    results.push({
      id: noticeIdForUrl(url.canonicalURL),
      title,
      summary: reason ?? product ?? "See the FDA source for recall details.",
      productDescription: product,
      reasonForRecall: reason,
      companyName: company,
      classification: null,
      status: terminated ? "Terminated" : null,
      distribution: null,
      codeInfo: null,
      publicationDate,
      recallInitiationDate: null,
      retrievedAt,
      sourceURL: url.sourceURL,
      canonicalURL: url.canonicalURL,
      sourceGUID: null,
      sourceKind: "annual",
      foodClassification: "food",
      eligibleForAlert: false,
    });
  }
  if (canonicalURLs.size === 0) throw new Error("FDA annual XML contained no valid official recall URLs");
  return { foodNotices: results, canonicalURLs: [...canonicalURLs] };
}

export function parseAnnualXml(xml: string, retrievedAt: string): StoredNotice[] {
  return parseAnnualDocument(xml, retrievedAt).foodNotices;
}

export interface FdaSource {
  fetchRss(): Promise<string>;
  fetchAnnual(): Promise<string[]>;
  fetchAnnouncement(url: string): Promise<AnnouncementDocument>;
}

function validatedFdaHttpsUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "www.fda.gov" && url.hostname !== "fda.gov") ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("FDA source URL must use HTTPS on fda.gov");
  }
  return url;
}

async function fetchBounded(
  input: string,
  accept: string,
  maximumBytes: number,
  timeoutMs: number,
): Promise<{ body: string; finalURL: string }> {
  let current = validatedFdaHttpsUrl(input);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetch(current, {
      headers: { accept, "user-agent": "BeanstalkRecallService/0.1 (+https://jacobrakai.org/)" },
      redirect: "manual",
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 4) throw new Error("FDA source exceeded redirect limit");
      const location = response.headers.get("location");
      if (!location) throw new Error("FDA source redirect omitted Location");
      await response.body?.cancel();
      current = validatedFdaHttpsUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`FDA source returned HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > maximumBytes) throw new Error("FDA source response exceeded size limit");
    if (!response.body) throw new Error("FDA source response had no body");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("FDA source response exceeded size limit");
        throw new Error("FDA source response exceeded size limit");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { body: new TextDecoder().decode(bytes), finalURL: current.toString() };
  }
  throw new Error("FDA source redirect resolution failed");
}

export class HttpFdaSource implements FdaSource {
  constructor(
    private readonly rssUrl = DEFAULT_RSS_URL,
    private readonly annualUrls: readonly string[] = [DEFAULT_ANNUAL_XML_URL],
  ) {}

  fetchRss(): Promise<string> {
    return fetchBounded(this.rssUrl, "application/xml, text/xml;q=0.9", 5 * 1024 * 1024, 30_000).then(
      ({ body }) => body,
    );
  }

  fetchAnnual(): Promise<string[]> {
    return Promise.all(
      this.annualUrls.map((url) =>
        fetchBounded(url, "application/xml, text/xml;q=0.9", 50 * 1024 * 1024, 30_000).then(({ body }) => body),
      ),
    );
  }

  fetchAnnouncement(url: string): Promise<AnnouncementDocument> {
    return fetchBounded(url, "text/html, application/xhtml+xml;q=0.9", 5 * 1024 * 1024, 15_000).then(
      ({ body, finalURL }) => ({ html: body, finalURL }),
    );
  }
}
