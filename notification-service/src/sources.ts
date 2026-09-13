import { load } from "cheerio";
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

export interface AnnouncementDocument {
  html: string;
  finalURL: string;
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
  let current = announcementHeading.next();
  while (current.length > 0) {
    if (current.attr("id") === "recall-photos") break;
    const nestedHeading = normalizedPageText(current.find("h2").first().text());
    if (/^Company Contact Information$/iu.test(nestedHeading)) break;

    const tableRows: string[] = [];
    current
      .find("table")
      .addBack("table")
      .each((_tableIndex, table) => {
        $(table)
          .find("tr")
          .each((_rowIndex, row) => {
            const cells = $(row)
              .find("th, td")
              .map((_cellIndex, cell) => normalizedPageText($(cell).text()))
              .get()
              .filter(Boolean);
            if (cells.length > 0) tableRows.push(cells.join(" | "));
          });
      });
    const blockText = tableRows.length > 0 ? tableRows.join("\n") : normalizedPageText(current.text());
    if (blockText) announcementParts.push(blockText);
    if (tableRows.length > 0) codeParts.push(tableRows.join("\n"));

    current
      .find("p, li")
      .addBack("p, li")
      .each((_textIndex, element) => {
        const value = normalizedPageText($(element).text());
        if (!value) return;
        if (/\b(lot|code|upc|plu|best by|use by|sell by|expiration|package)\b/iu.test(value)) codeParts.push(value);
        if (/\b(distribut(?:ed|ion)|sold|available|stores?|states?|nationwide|online)\b/iu.test(value)) {
          distributionParts.push(value);
        }
      });
    if (tableRows.some((row) => /\b(state|distribution|location)s?\b/iu.test(row))) {
      distributionParts.push(tableRows.join("\n"));
    }
    current = current.next();
  }

  const summary = announcementParts.join("\n\n").trim();
  if (summary.length < 40) throw new Error("FDA announcement page has no usable official announcement text");
  const productType = definition("Product Type");
  if (!productType) throw new Error("FDA announcement page is missing Product Type");
  const title = normalizedPageText($("h1.content-title").first().text()) || notice.title;
  const pageClassifiesFood = /(?:Food\s*&\s*Beverages|Pet Food)/iu.test(productType);
  const contentClassifiesFood = classifyRssItem(title, summary) === "food";
  const foodClassification = pageClassifiesFood && contentClassifiesFood ? "food" : "unknown";
  const unique = (values: string[]): string | null => {
    const deduplicated = [...new Set(values.filter(Boolean))];
    return deduplicated.length > 0 ? deduplicated.join("\n\n") : null;
  };
  return {
    ...notice,
    title,
    summary,
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

export function parseAnnualXml(xml: string, retrievedAt: string): StoredNotice[] {
  const document = parser.parse(xml) as {
    recallsdata?: { recalls?: AnnualItemXml | AnnualItemXml[] };
  };
  const items = list(document.recallsdata?.recalls);
  const results: StoredNotice[] = [];
  for (const item of items) {
    const productType = text(item.ProductType);
    if (!/(?:Food\s*&\s*Beverages|Pet Food)/iu.test(productType)) continue;
    const url = verifiedFdaUrl(text(item.Url));
    const publicationDate = annualIsoDate(text(item.Date));
    if (!url || !publicationDate) continue;
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
  if (results.length === 0) throw new Error("FDA annual XML contained no valid food recall records");
  return results;
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
