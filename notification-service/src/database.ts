import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, parse } from "node:path";
import Database from "better-sqlite3";
import type { RecallNotice, StoredNotice } from "./domain.js";

const MIGRATIONS = [
  `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE notices (
      id TEXT PRIMARY KEY,
      canonical_url TEXT NOT NULL UNIQUE,
      source_guid TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      product_description TEXT,
      reason_for_recall TEXT,
      company_name TEXT,
      classification TEXT,
      status TEXT,
      distribution TEXT,
      code_info TEXT,
      publication_date TEXT NOT NULL,
      recall_initiation_date TEXT,
      retrieved_at TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('rss', 'annual')),
      food_classification TEXT NOT NULL CHECK (food_classification IN ('food', 'unknown')),
      eligible_for_alert INTEGER NOT NULL DEFAULT 0 CHECK (eligible_for_alert IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX notices_feed_idx ON notices(food_classification, publication_date DESC, id DESC);
    CREATE INDEX notices_guid_idx ON notices(source_guid) WHERE source_guid IS NOT NULL;

    CREATE TABLE devices (
      id TEXT PRIMARY KEY,
      secret_hash TEXT NOT NULL,
      device_token TEXT NOT NULL,
      environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      disabled_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX active_device_token_idx
      ON devices(device_token, environment) WHERE active = 1;

    CREATE TABLE watch_terms (
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (device_id, term)
    );

    CREATE TABLE delivery_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      matched_term TEXT NOT NULL,
      matched_field TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'retry', 'sending', 'sent', 'permanent_failure')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      last_error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      UNIQUE (notice_id, device_id)
    );
    CREATE INDEX delivery_due_idx ON delivery_queue(status, next_attempt_at);

    CREATE TABLE poll_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      initialized INTEGER NOT NULL DEFAULT 0 CHECK (initialized IN (0, 1)),
      cursor_key TEXT,
      cursor_publication_date TEXT,
      last_poll_at TEXT,
      last_success_at TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      gap_status TEXT NOT NULL DEFAULT 'normal' CHECK (gap_status IN ('normal', 'paused', 'reconciling', 'failed')),
      gap_reason TEXT,
      last_reconcile_at TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL
    );
    INSERT INTO poll_state (id, updated_at) VALUES (1, datetime('now'));
  `,
  `
    ALTER TABLE delivery_queue ADD COLUMN failure_kind TEXT
      CHECK (failure_kind IN ('apns', 'canceled', 'internal'));
    UPDATE delivery_queue
      SET failure_kind = CASE
        WHEN last_error_code IN ('device_replaced', 'device_disabled', 'watchlist_changed') THEN 'canceled'
        WHEN last_error_code = 'notice_missing' THEN 'internal'
        WHEN status = 'permanent_failure' THEN 'apns'
        ELSE NULL
      END;
  `,
  `
    DROP INDEX active_device_token_idx;
    ALTER TABLE devices ADD COLUMN provider TEXT NOT NULL DEFAULT 'apns'
      CHECK (provider IN ('apns', 'fcm'));
    ALTER TABLE devices ADD COLUMN identifier_kind TEXT NOT NULL DEFAULT 'token'
      CHECK (identifier_kind IN ('token', 'fid'));
    CREATE UNIQUE INDEX active_push_identifier_idx
      ON devices(provider, device_token, environment) WHERE active = 1;

    ALTER TABLE delivery_queue ADD COLUMN failure_provider TEXT
      CHECK (failure_provider IN ('apns', 'fcm'));
    UPDATE delivery_queue SET failure_provider = 'apns' WHERE failure_kind = 'apns';
  `,
] as const;

interface PollStateRow {
  initialized: number;
  cursor_key: string | null;
  cursor_publication_date: string | null;
  last_poll_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  gap_status: "normal" | "paused" | "reconciling" | "failed";
  gap_reason: string | null;
  last_reconcile_at: string | null;
  last_error: string | null;
}

export interface PollState {
  initialized: boolean;
  cursorKey: string | null;
  cursorPublicationDate: string | null;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  gapStatus: PollStateRow["gap_status"];
  gapReason: string | null;
  lastReconcileAt: string | null;
  lastError: string | null;
}

interface NoticeRow {
  id: string;
  canonical_url: string;
  source_guid: string | null;
  title: string;
  summary: string;
  product_description: string | null;
  reason_for_recall: string | null;
  company_name: string | null;
  classification: string | null;
  status: string | null;
  distribution: string | null;
  code_info: string | null;
  publication_date: string;
  recall_initiation_date: string | null;
  retrieved_at: string;
  source_url: string;
  source_kind: "rss" | "annual";
  food_classification: "food" | "unknown";
  eligible_for_alert: number;
}

function toStoredNotice(row: NoticeRow): StoredNotice {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    productDescription: row.product_description,
    reasonForRecall: row.reason_for_recall,
    companyName: row.company_name,
    classification: row.classification,
    status: row.status,
    distribution: row.distribution,
    codeInfo: row.code_info,
    publicationDate: row.publication_date,
    recallInitiationDate: row.recall_initiation_date,
    retrievedAt: row.retrieved_at,
    sourceURL: row.source_url,
    canonicalURL: row.canonical_url,
    sourceGUID: row.source_guid,
    sourceKind: row.source_kind,
    foodClassification: row.food_classification,
    eligibleForAlert: row.eligible_for_alert === 1,
  };
}

export function publicNotice(notice: StoredNotice): RecallNotice {
  return {
    id: notice.id,
    title: notice.title,
    summary: notice.summary,
    productDescription: notice.productDescription,
    reasonForRecall: notice.reasonForRecall,
    companyName: notice.companyName,
    classification: notice.classification,
    status: notice.status,
    distribution: notice.distribution,
    codeInfo: notice.codeInfo,
    publicationDate: notice.publicationDate,
    recallInitiationDate: notice.recallInitiationDate,
    retrievedAt: notice.retrievedAt,
    sourceURL: notice.sourceURL,
  };
}

export class AppDatabase {
  readonly connection: Database.Database;

  constructor(readonly path: string) {
    if (path !== ":memory:") {
      const directory = dirname(path);
      if (!isAbsolute(path) || directory === parse(path).root) {
        throw new Error("Database path must be absolute and inside a dedicated data directory");
      }
      process.umask(0o077);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      chmodSync(directory, 0o700);
    }
    this.connection = new Database(path);
    this.connection.pragma("journal_mode = WAL");
    this.connection.pragma("foreign_keys = ON");
    this.connection.pragma("busy_timeout = 5000");
    this.migrate();
    if (path !== ":memory:") {
      this.hardenFiles();
    }
  }

  private hardenFiles(): void {
    for (const candidate of [this.path, `${this.path}-wal`, `${this.path}-shm`]) {
      if (existsSync(candidate)) chmodSync(candidate, 0o600);
    }
  }

  migrate(): void {
    this.connection.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
    );
    const applied = new Set(
      this.connection
        .prepare("SELECT version FROM schema_migrations")
        .all()
        .map((row) => (row as { version: number }).version),
    );
    const apply = this.connection.transaction((version: number, sql: string) => {
      this.connection.exec(sql);
      this.connection
        .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
        .run(version, new Date().toISOString());
    });
    MIGRATIONS.forEach((sql, index) => {
      const version = index + 1;
      if (!applied.has(version)) apply(version, sql);
    });
  }

  close(): void {
    this.connection.close();
  }

  getPollState(): PollState {
    const row = this.connection.prepare("SELECT * FROM poll_state WHERE id = 1").get() as PollStateRow;
    return {
      initialized: row.initialized === 1,
      cursorKey: row.cursor_key,
      cursorPublicationDate: row.cursor_publication_date,
      lastPollAt: row.last_poll_at,
      lastSuccessAt: row.last_success_at,
      consecutiveFailures: row.consecutive_failures,
      gapStatus: row.gap_status,
      gapReason: row.gap_reason,
      lastReconcileAt: row.last_reconcile_at,
      lastError: row.last_error,
    };
  }

  updatePollState(values: Partial<{
    initialized: number;
    cursor_key: string | null;
    cursor_publication_date: string | null;
    last_poll_at: string | null;
    last_success_at: string | null;
    consecutive_failures: number;
    gap_status: PollStateRow["gap_status"];
    gap_reason: string | null;
    last_reconcile_at: string | null;
    last_error: string | null;
  }>, now: string): void {
    const entries = Object.entries(values);
    if (entries.length === 0) return;
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    this.connection
      .prepare(`UPDATE poll_state SET ${assignments}, updated_at = ? WHERE id = 1`)
      .run(...entries.map(([, value]) => value), now);
  }

  upsertNotice(notice: StoredNotice): boolean {
    const existing = this.connection
      .prepare("SELECT id FROM notices WHERE canonical_url = ?")
      .get(notice.canonicalURL) as { id: string } | undefined;
    this.connection
      .prepare(`
        INSERT INTO notices (
          id, canonical_url, source_guid, title, summary, product_description, reason_for_recall,
          company_name, classification, status, distribution, code_info, publication_date,
          recall_initiation_date, retrieved_at, source_url, source_kind, food_classification,
          eligible_for_alert, created_at, updated_at
        ) VALUES (
          @id, @canonicalURL, @sourceGUID, @title, @summary, @productDescription, @reasonForRecall,
          @companyName, @classification, @status, @distribution, @codeInfo, @publicationDate,
          @recallInitiationDate, @retrievedAt, @sourceURL, @sourceKind, @foodClassification,
          @eligibleForAlert, @createdAt, @updatedAt
        )
        ON CONFLICT(canonical_url) DO UPDATE SET
          source_guid = COALESCE(excluded.source_guid, notices.source_guid),
          title = CASE WHEN excluded.source_kind = 'rss' THEN excluded.title ELSE notices.title END,
          summary = CASE WHEN excluded.source_kind = 'rss' THEN excluded.summary ELSE notices.summary END,
          product_description = COALESCE(notices.product_description, excluded.product_description),
          reason_for_recall = COALESCE(notices.reason_for_recall, excluded.reason_for_recall),
          company_name = COALESCE(notices.company_name, excluded.company_name),
          classification = COALESCE(notices.classification, excluded.classification),
          status = COALESCE(notices.status, excluded.status),
          distribution = COALESCE(notices.distribution, excluded.distribution),
          code_info = COALESCE(notices.code_info, excluded.code_info),
          publication_date = CASE WHEN excluded.source_kind = 'rss' THEN excluded.publication_date ELSE notices.publication_date END,
          recall_initiation_date = COALESCE(notices.recall_initiation_date, excluded.recall_initiation_date),
          retrieved_at = excluded.retrieved_at,
          source_url = CASE WHEN excluded.source_kind = 'rss' THEN excluded.source_url ELSE notices.source_url END,
          source_kind = CASE WHEN excluded.source_kind = 'rss' THEN 'rss' ELSE notices.source_kind END,
          food_classification = CASE WHEN excluded.food_classification = 'food' THEN 'food' ELSE notices.food_classification END,
          eligible_for_alert = MAX(notices.eligible_for_alert, excluded.eligible_for_alert),
          updated_at = excluded.updated_at
      `)
      .run({
        ...notice,
        eligibleForAlert: notice.eligibleForAlert ? 1 : 0,
        createdAt: notice.retrievedAt,
        updatedAt: notice.retrievedAt,
      });
    return existing === undefined;
  }

  getStoredNotice(id: string): StoredNotice | null {
    const row = this.connection.prepare("SELECT * FROM notices WHERE id = ?").get(id) as NoticeRow | undefined;
    return row ? toStoredNotice(row) : null;
  }

  hasCanonicalUrl(url: string): boolean {
    return this.connection.prepare("SELECT 1 FROM notices WHERE canonical_url = ?").get(url) !== undefined;
  }

  listNotices(input: { limit: number; cursor?: { publicationDate: string; id: string }; query?: string }): {
    items: RecallNotice[];
    nextCursor: string | null;
  } {
    const clauses = ["food_classification = 'food'"];
    const parameters: Record<string, string | number> = { fetchLimit: input.limit + 1 };
    if (input.cursor) {
      clauses.push("(publication_date < @cursorDate OR (publication_date = @cursorDate AND id < @cursorId))");
      parameters.cursorDate = input.cursor.publicationDate;
      parameters.cursorId = input.cursor.id;
    }
    if (input.query) {
      clauses.push(`(
        title LIKE @query ESCAPE '\\' COLLATE NOCASE OR summary LIKE @query ESCAPE '\\' COLLATE NOCASE OR
        COALESCE(product_description, '') LIKE @query ESCAPE '\\' COLLATE NOCASE OR
        COALESCE(reason_for_recall, '') LIKE @query ESCAPE '\\' COLLATE NOCASE OR
        COALESCE(company_name, '') LIKE @query ESCAPE '\\' COLLATE NOCASE
      )`);
      parameters.query = `%${input.query.replace(/[\\%_]/gu, "\\$&")}%`;
    }
    const rows = this.connection
      .prepare(`SELECT * FROM notices WHERE ${clauses.join(" AND ")} ORDER BY publication_date DESC, id DESC LIMIT @fetchLimit`)
      .all(parameters) as NoticeRow[];
    const page = rows.slice(0, input.limit).map(toStoredNotice);
    const last = page.at(-1);
    return {
      items: page.map(publicNotice),
      nextCursor:
        rows.length > input.limit && last
          ? Buffer.from(JSON.stringify({ publicationDate: last.publicationDate, id: last.id })).toString("base64url")
          : null,
    };
  }
}
