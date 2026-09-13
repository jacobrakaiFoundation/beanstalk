import type { DeliveryResult, PushMessage, PushSender } from "../src/apns.js";
import type { AppDatabase } from "../src/database.js";
import type { StoredNotice } from "../src/domain.js";
import { canonicalizeFdaUrl, noticeIdForUrl } from "../src/domain.js";
import type { AnnouncementDocument, FdaSource } from "../src/sources.js";

export class FakeSender implements PushSender {
  readonly configured: boolean;
  readonly messages: PushMessage[] = [];

  constructor(
    private readonly results: DeliveryResult[] = [{ kind: "success" }],
    configured = true,
  ) {
    this.configured = configured;
  }

  async send(message: PushMessage): Promise<DeliveryResult> {
    this.messages.push(message);
    return this.results.shift() ?? { kind: "success" };
  }

  close(): void {}
}

export class FakeSource implements FdaSource {
  rss = "";
  annual: string[] = [];
  annualError: Error | null = null;
  announcementError: Error | null = null;
  announcementDocuments = new Map<string, AnnouncementDocument>();
  announcementFetches = 0;

  async fetchRss(): Promise<string> {
    return this.rss;
  }

  async fetchAnnual(): Promise<string[]> {
    if (this.annualError) throw this.annualError;
    return this.annual;
  }

  async fetchAnnouncement(url: string): Promise<AnnouncementDocument> {
    this.announcementFetches += 1;
    if (this.announcementError) throw this.announcementError;
    return (
      this.announcementDocuments.get(url) ?? {
        finalURL: url,
        html: `<!doctype html><html><body>
          <h1 class="content-title">Fixture FDA recall</h1>
          <dl>
            <dt>Product Type:</dt><dd>Food &amp; Beverages</dd>
            <dt>Reason for Announcement:</dt><dd><div class="field--item">Potential Salmonella contamination</div></dd>
            <dt>Company Name:</dt><dd>Fixture Company</dd>
            <dt>Product Description:</dt><dd><div class="field--item">Fixture food</div></dd>
          </dl>
          <h2 id="recall-announcement">Company Announcement</h2>
          <p>Fixture Company is recalling this food because it may contain Salmonella. This is complete deterministic test wording.</p>
          <p>The product was distributed nationwide in retail stores.</p>
          <div><table><tr><th>Lot Code</th><th>Best By</th></tr><tr><td>LOT-123</td><td>12/31/2026</td></tr></table></div>
          <div><h2>Company Contact Information</h2></div>
        </body></html>`,
      }
    );
  }
}

export function rss(items: Array<{ slug: string; title: string; summary?: string; date: string }>): string {
  return `<?xml version="1.0"?><rss><channel>${items
    .map(
      (item) => `<item>
        <title>${item.title}</title>
        <link>http://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/${item.slug}</link>
        <description>${item.summary ?? item.title}</description>
        <pubDate>${item.date}</pubDate>
        <guid isPermaLink="true">http://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/${item.slug}</guid>
      </item>`,
    )
    .join("")}</channel></rss>`;
}

export function annual(items: Array<{ slug: string; date: string; brand?: string; reason?: string }>): string {
  return `<?xml version="1.0"?><recallsdata>${items
    .map(
      (item) => `<recalls>
        <Brand>${item.brand ?? "Test Brand"}</Brand>
        <Company>Test Company</Company>
        <Date>${item.date}</Date>
        <ProductDescription>Test Food</ProductDescription>
        <ProductType>Food &amp; Beverages, Foodborne Illness</ProductType>
        <Reason>${item.reason ?? "Potential Salmonella contamination"}</Reason>
        <Url>https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/${item.slug}</Url>
        <Terminated/>
      </recalls>`,
    )
    .join("")}</recallsdata>`;
}

export function storedNotice(slug: string, publicationDate: string, title = slug): StoredNotice {
  const sourceURL = `https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/${slug}`;
  const canonicalURL = canonicalizeFdaUrl(sourceURL);
  return {
    id: noticeIdForUrl(canonicalURL),
    title,
    summary: `Summary for ${title}`,
    productDescription: null,
    reasonForRecall: null,
    companyName: null,
    classification: null,
    status: null,
    distribution: null,
    codeInfo: null,
    publicationDate,
    recallInitiationDate: null,
    retrievedAt: "2026-09-13T20:00:00.000Z",
    sourceURL,
    canonicalURL,
    sourceGUID: sourceURL,
    sourceKind: "rss",
    foodClassification: "food",
    eligibleForAlert: true,
  };
}

export function queueCount(database: AppDatabase): number {
  return (database.connection.prepare("SELECT COUNT(*) AS count FROM delivery_queue").get() as { count: number }).count;
}
