import type { AppDatabase } from "./database.js";
import type { NotificationQueue } from "./queue.js";
import {
  enrichFromAnnouncement,
  parseAnnualDocument,
  parseRss,
  wasShortened,
  type FdaSource,
  type ParsedRssItem,
} from "./sources.js";

export interface PollLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
}

const silentLogger: PollLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown polling error").slice(0, 500);
}

export type PollResult =
  | { kind: "seeded"; noticeCount: number }
  | { kind: "updated"; newNoticeCount: number; queuedCount: number }
  | { kind: "reconciled"; newNoticeCount: number; queuedCount: number }
  | { kind: "gap-paused"; reason: string };

export class FdaPoller {
  constructor(
    private readonly database: AppDatabase,
    private readonly queue: NotificationQueue,
    private readonly source: FdaSource,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: PollLogger = silentLogger,
    private readonly announcementConcurrency = 4,
  ) {}

  async pollOnce(): Promise<PollResult> {
    const startedAt = this.now().toISOString();
    this.database.updatePollState({ last_poll_at: startedAt }, startedAt);
    try {
      const parsed = parseRss(await this.source.fetchRss(), startedAt);
      const state = this.database.getPollState();
      if (!state.initialized) return await this.seed(parsed, startedAt);
      const cursorIndex = parsed.findIndex((item) => item.cursorKey === state.cursorKey);
      if (cursorIndex < 0) return await this.reconcileGap(parsed, startedAt);
      return await this.ingestNormal(parsed, cursorIndex, startedAt);
    } catch (error) {
      const current = this.database.getPollState();
      const message = errorMessage(error);
      this.database.updatePollState(
        {
          consecutive_failures: current.consecutiveFailures + 1,
          last_error: message,
          gap_status: "failed",
          gap_reason: current.gapReason ?? `FDA poll incomplete: ${message}`,
        },
        startedAt,
      );
      this.logger.error({ error: message }, "FDA polling failed");
      throw error;
    }
  }

  private async seed(items: ParsedRssItem[], now: string): Promise<PollResult> {
    const enrichedItems = await this.enrich(items);
    const ingest = this.database.connection.transaction(() => {
      for (const item of enrichedItems) {
        this.database.upsertNotice({ ...item.notice, eligibleForAlert: false });
      }
      const newest = enrichedItems[0];
      if (!newest) throw new Error("FDA RSS seed contained no items");
      this.database.updatePollState(
        {
          initialized: 1,
          cursor_key: newest.cursorKey,
          cursor_publication_date: newest.notice.publicationDate,
          last_success_at: now,
          consecutive_failures: 0,
          gap_status: "normal",
          gap_reason: null,
          last_error: null,
        },
        now,
      );
    });
    ingest();
    this.logger.info({ noticeCount: enrichedItems.length }, "FDA history seeded without notifications");
    return { kind: "seeded", noticeCount: enrichedItems.length };
  }

  private async ingestNormal(items: ParsedRssItem[], cursorIndex: number, now: string): Promise<PollResult> {
    // FDA can correct the linked announcement without moving its RSS URL or date.
    // Refresh the complete short feed, but only newly discovered URLs may alert.
    const enrichedItems = await this.enrich(items);
    const newItems = enrichedItems.slice(0, cursorIndex).filter((item) => !this.database.hasCanonicalUrl(item.cursorKey));
    const newIds = new Set(newItems.map((item) => item.notice.id));
    let queuedCount = 0;
    const ingest = this.database.connection.transaction(() => {
      for (const item of enrichedItems) {
        this.database.upsertNotice({ ...item.notice, eligibleForAlert: newIds.has(item.notice.id) });
      }
      const newest = items[0];
      if (!newest) throw new Error("FDA RSS update contained no items");
      this.database.updatePollState(
        {
          cursor_key: newest.cursorKey,
          cursor_publication_date: newest.notice.publicationDate,
          last_success_at: now,
          consecutive_failures: 0,
          gap_status: "normal",
          gap_reason: null,
          last_error: null,
        },
        now,
      );
      for (const item of newItems) queuedCount += this.queue.enqueueNotice(item.notice.id, now);
    });
    ingest();
    this.logger.info({ newNoticeCount: newItems.length, queuedCount }, "FDA RSS update completed");
    return { kind: "updated", newNoticeCount: newItems.length, queuedCount };
  }

  private async reconcileGap(items: ParsedRssItem[], now: string): Promise<PollResult> {
    const state = this.database.getPollState();
    const reason = `Previous RSS cursor is absent: ${state.cursorKey ?? "none"}`;
    this.database.updatePollState({ gap_status: "paused", gap_reason: reason }, now);
    this.logger.warn({ previousCursor: state.cursorKey }, "RSS gap detected; notification delivery paused");
    this.database.updatePollState({ gap_status: "reconciling" }, now);
    const annualDocuments = await this.source.fetchAnnual();
    if (annualDocuments.length === 0) throw new Error("No FDA annual XML sources are configured");
    const annualRecords = annualDocuments.map((xml) => parseAnnualDocument(xml, now));
    const annualNotices = annualRecords.flatMap((document) => document.foodNotices);
    // The food feed can contain non-food announcements; their URLs still prove
    // continuity, although the records themselves must never become food alerts.
    const annualUrls = new Set(annualRecords.flatMap((document) => document.canonicalURLs));
    if (!state.cursorKey || !annualUrls.has(state.cursorKey)) {
      const failure = "Official annual XML did not contain the previous RSS cursor";
      this.database.updatePollState(
        {
          gap_status: "failed",
          gap_reason: reason,
          last_reconcile_at: now,
          last_error: failure,
          consecutive_failures: state.consecutiveFailures + 1,
        },
        now,
      );
      this.logger.error({ annualRecordCount: annualNotices.length }, failure);
      return { kind: "gap-paused", reason: failure };
    }

    const cutoff = state.cursorPublicationDate ? Date.parse(state.cursorPublicationDate) : Number.NaN;
    const candidates = items.filter(
      (item) => !this.database.hasCanonicalUrl(item.notice.canonicalURL) && Date.parse(item.notice.publicationDate) > cutoff,
    );
    const candidateIds = new Set(candidates.map((item) => item.notice.id));
    const enrichedItems = await this.enrich(items);
    const enrichedCandidates = enrichedItems.filter((item) => candidateIds.has(item.notice.id));
    let queuedCount = 0;
    const reconcile = this.database.connection.transaction(() => {
      for (const notice of annualNotices) this.database.upsertNotice({ ...notice, eligibleForAlert: false });
      for (const item of enrichedItems) {
        this.database.upsertNotice({ ...item.notice, eligibleForAlert: candidateIds.has(item.notice.id) });
      }
      const newest = items[0];
      if (!newest) throw new Error("FDA RSS reconciliation contained no items");
      this.database.updatePollState(
        {
          cursor_key: newest.cursorKey,
          cursor_publication_date: newest.notice.publicationDate,
          last_success_at: now,
          consecutive_failures: 0,
          gap_status: "normal",
          gap_reason: null,
          last_reconcile_at: now,
          last_error: null,
        },
        now,
      );
      for (const item of enrichedCandidates) queuedCount += this.queue.enqueueNotice(item.notice.id, now);
    });
    reconcile();
    this.logger.info(
      { annualRecordCount: annualNotices.length, newNoticeCount: enrichedCandidates.length, queuedCount },
      "FDA RSS gap reconciled",
    );
    return { kind: "reconciled", newNoticeCount: enrichedCandidates.length, queuedCount };
  }

  private async enrich(items: ParsedRssItem[]): Promise<ParsedRssItem[]> {
    if (items.length === 0) return [];
    if (!Number.isInteger(this.announcementConcurrency) || this.announcementConcurrency < 1 || this.announcementConcurrency > 8) {
      throw new Error("Announcement concurrency must be between 1 and 8");
    }
    const results = new Array<ParsedRssItem>(items.length);
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (!item) continue;
        // One unreadable page still fails the whole poll (a recall must never be
        // silently skipped), but the log names which notice did it.
        let enriched: ParsedRssItem["notice"];
        try {
          const document = await this.source.fetchAnnouncement(item.notice.sourceURL);
          enriched = enrichFromAnnouncement(item.notice, document);
        } catch (error) {
          this.logger.error(
            { noticeId: item.notice.id, sourceURL: item.notice.sourceURL, error: error instanceof Error ? error.message : String(error) },
            "FDA announcement enrichment failed",
          );
          throw error;
        }
        const shortenedFields = (["summary", "codeInfo", "distribution"] as const).filter((field) => wasShortened(enriched[field]));
        if (shortenedFields.length > 0) {
          this.logger.warn({ noticeId: enriched.id, sourceURL: enriched.sourceURL, shortenedFields }, "FDA announcement text shortened");
        }
        results[index] = { ...item, notice: enriched };
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.announcementConcurrency, items.length) }, () => worker()));
    return results;
  }
}
