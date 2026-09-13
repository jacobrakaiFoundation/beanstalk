import type { PushSender } from "./apns.js";
import type { AppDatabase } from "./database.js";
import { publicNotice } from "./database.js";
import type { ApnsEnvironment, DeviceStore } from "./devices.js";
import { findNoticeMatch } from "./domain.js";

interface QueueRow {
  id: number;
  notice_id: string;
  device_id: string;
  matched_term: string;
  matched_field: string;
  attempts: number;
  publication_date: string;
  device_token: string;
  environment: ApnsEnvironment;
}

export const MAXIMUM_ALERT_AGE_MS = 24 * 60 * 60 * 1_000;

export interface QueueHealth {
  queued: number;
  retrying: number;
  sending: number;
  failed: number;
  recentApnsFailures: number;
  lastApnsFailureAt: string | null;
  lastApnsFailureCode: string | null;
  lastSentAt: string | null;
  oldestPendingAt: string | null;
}

function safeErrorCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "_").slice(0, 120) || "unknown";
}

function truncate(value: string, length: number): string {
  const characters = [...value];
  return characters.length <= length ? value : `${characters.slice(0, length - 1).join("")}…`;
}

export class NotificationQueue {
  constructor(
    private readonly database: AppDatabase,
    private readonly devices: DeviceStore,
    private readonly sender: PushSender,
    private readonly maximumAttempts = 8,
    private readonly maximumAlertAgeMs = MAXIMUM_ALERT_AGE_MS,
  ) {}

  recoverInterrupted(now: string): void {
    this.database.connection
      .prepare("UPDATE delivery_queue SET status = 'retry', next_attempt_at = ?, last_error_code = 'worker_restarted', updated_at = ? WHERE status = 'sending'")
      .run(now, now);
  }

  enqueueNotice(noticeId: string, now: string): number {
    const notice = this.database.getStoredNotice(noticeId);
    if (!notice || !notice.eligibleForAlert || notice.foodClassification !== "food" || notice.sourceKind !== "rss") {
      return 0;
    }
    const rows = this.database.connection
      .prepare(`
        SELECT d.id AS device_id, wt.term
        FROM devices d
        JOIN watch_terms wt ON wt.device_id = d.id
        WHERE d.active = 1
        ORDER BY d.id, wt.term
      `)
      .all() as { device_id: string; term: string }[];
    const termsByDevice = new Map<string, string[]>();
    for (const row of rows) {
      const terms = termsByDevice.get(row.device_id) ?? [];
      terms.push(row.term);
      termsByDevice.set(row.device_id, terms);
    }
    const insert = this.database.connection.prepare(`
      INSERT INTO delivery_queue(
        notice_id, device_id, matched_term, matched_field, status, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)
      ON CONFLICT(notice_id, device_id) DO NOTHING
    `);
    let count = 0;
    const enqueue = this.database.connection.transaction(() => {
      for (const [deviceId, terms] of termsByDevice) {
        const match = findNoticeMatch(publicNotice(notice), terms);
        if (!match) continue;
        count += insert.run(notice.id, deviceId, match.term, match.field, now, now, now).changes;
      }
    });
    enqueue();
    return count;
  }

  async processDue(now: string, limit = 50): Promise<number> {
    this.cancelIneligiblePending(now);
    if (!this.sender.configured) return 0;
    if (!this.deliveryAllowed()) return 0;
    const due = this.database.connection
      .prepare(`
        SELECT q.id, q.notice_id, q.device_id, q.matched_term, q.matched_field, q.attempts,
               n.publication_date, d.device_token, d.environment
        FROM delivery_queue q
        JOIN notices n ON n.id = q.notice_id
        JOIN devices d ON d.id = q.device_id
        WHERE q.status IN ('queued', 'retry') AND q.next_attempt_at <= ? AND d.active = 1
        ORDER BY q.next_attempt_at, q.id
        LIMIT ?
      `)
      .all(now, limit) as QueueRow[];
    let processed = 0;
    for (const row of due) {
      if (!this.deliveryAllowed()) break;
      const dateFailure = this.alertDateFailure(row.publication_date, now);
      if (dateFailure) {
        this.cancelPermanently(row.id, dateFailure, now);
        continue;
      }
      const claimed = this.database.connection
        .prepare(`
          UPDATE delivery_queue
          SET status = 'sending', updated_at = ?
          WHERE id = ? AND status IN ('queued', 'retry')
            AND EXISTS (
              SELECT 1 FROM poll_state
              WHERE id = 1 AND initialized = 1 AND gap_status = 'normal'
            )
        `)
        .run(now, row.id);
      if (claimed.changes !== 1) continue;
      if (!this.deliveryAllowed()) {
        this.database.connection
          .prepare("UPDATE delivery_queue SET status = 'queued', next_attempt_at = ?, last_error_code = 'gap_paused', updated_at = ? WHERE id = ? AND status = 'sending'")
          .run(now, now, row.id);
        break;
      }
      const notice = this.database.getStoredNotice(row.notice_id);
      if (!notice) {
        this.failPermanently(row.id, row.attempts + 1, "notice_missing", "internal", now);
        continue;
      }
      const currentDateFailure = this.alertDateFailure(notice.publicationDate, now);
      if (currentDateFailure) {
        this.cancelPermanently(row.id, currentDateFailure, now);
        continue;
      }
      const result = await this.sender.send({
        deviceToken: row.device_token,
        environment: row.environment,
        noticeId: notice.id,
        title: truncate(notice.title, 100),
        body: truncate(notice.reasonForRecall ?? notice.summary, 170),
        matchedTerm: row.matched_term,
        matchedField: row.matched_field,
      });
      const stillClaimed = this.database.connection
        .prepare("SELECT 1 FROM delivery_queue WHERE id = ? AND status = 'sending'")
        .get(row.id);
      if (!stillClaimed) {
        processed += 1;
        continue;
      }
      const attempt = row.attempts + 1;
      if (result.kind === "success") {
        this.database.connection
          .prepare("UPDATE delivery_queue SET status = 'sent', attempts = ?, sent_at = ?, last_error_code = NULL, updated_at = ? WHERE id = ?")
          .run(attempt, now, now, row.id);
      } else if (result.kind === "invalid") {
        const code = safeErrorCode(result.code);
        const disable = this.database.connection.transaction(() => {
          this.devices.disable(row.device_id, code, now);
          this.failPermanently(row.id, attempt, code, "apns", now);
          this.database.connection
            .prepare("UPDATE delivery_queue SET status = 'permanent_failure', last_error_code = 'device_disabled', failure_kind = 'canceled', updated_at = ? WHERE device_id = ? AND status IN ('queued', 'retry')")
            .run(now, row.device_id);
        });
        disable();
      } else if (result.kind === "transient" && attempt < this.maximumAttempts) {
        const delaySeconds = Math.min(30 * 2 ** (attempt - 1), 6 * 60 * 60);
        const next = new Date(Date.parse(now) + delaySeconds * 1000).toISOString();
        this.database.connection
          .prepare("UPDATE delivery_queue SET status = 'retry', attempts = ?, next_attempt_at = ?, last_error_code = ?, updated_at = ? WHERE id = ?")
          .run(attempt, next, safeErrorCode(result.code), now, row.id);
      } else {
        this.failPermanently(row.id, attempt, safeErrorCode(result.code), "apns", now);
      }
      processed += 1;
    }
    return processed;
  }

  health(now = new Date().toISOString()): QueueHealth {
    const rows = this.database.connection
      .prepare("SELECT status, COUNT(*) AS count FROM delivery_queue GROUP BY status")
      .all() as { status: string; count: number }[];
    const count = (status: string): number => rows.find((row) => row.status === status)?.count ?? 0;
    const recentCutoff = new Date(Date.parse(now) - 24 * 60 * 60 * 1000).toISOString();
    const details = this.database.connection
      .prepare(`
        SELECT
          SUM(CASE WHEN failure_kind = 'apns' AND updated_at >= ? THEN 1 ELSE 0 END) AS recent_apns_failures,
          MAX(CASE WHEN failure_kind = 'apns' THEN updated_at END) AS last_apns_failure_at,
          MAX(sent_at) AS last_sent_at,
          MIN(CASE WHEN status IN ('queued', 'retry', 'sending') THEN created_at END) AS oldest_pending_at
        FROM delivery_queue
      `)
      .get(recentCutoff) as {
        recent_apns_failures: number | null;
        last_apns_failure_at: string | null;
        last_sent_at: string | null;
        oldest_pending_at: string | null;
      };
    const lastApnsFailure = this.database.connection
      .prepare("SELECT last_error_code FROM delivery_queue WHERE failure_kind = 'apns' ORDER BY updated_at DESC, id DESC LIMIT 1")
      .get() as { last_error_code: string | null } | undefined;
    return {
      queued: count("queued"),
      retrying: count("retry"),
      sending: count("sending"),
      failed: count("permanent_failure"),
      recentApnsFailures: details.recent_apns_failures ?? 0,
      lastApnsFailureAt: details.last_apns_failure_at,
      lastApnsFailureCode: lastApnsFailure?.last_error_code ?? null,
      lastSentAt: details.last_sent_at,
      oldestPendingAt: details.oldest_pending_at,
    };
  }

  prune(before: string): number {
    return this.database.connection
      .prepare("DELETE FROM delivery_queue WHERE created_at < ?")
      .run(before).changes;
  }

  private deliveryAllowed(): boolean {
    const state = this.database.getPollState();
    return state.initialized && state.gapStatus === "normal";
  }

  private alertDateFailure(publicationDate: string, now: string): "alert_expired" | "notice_date_invalid" | "notice_date_future" | null {
    const nowMilliseconds = Date.parse(now);
    const publicationMilliseconds = Date.parse(publicationDate);
    if (!Number.isFinite(nowMilliseconds) || !Number.isFinite(publicationMilliseconds)) return "notice_date_invalid";
    if (publicationMilliseconds > nowMilliseconds) return "notice_date_future";
    if (nowMilliseconds - publicationMilliseconds > this.maximumAlertAgeMs) return "alert_expired";
    return null;
  }

  private cancelIneligiblePending(now: string): number {
    const rows = this.database.connection
      .prepare(`
        SELECT q.id, n.publication_date
        FROM delivery_queue q
        JOIN notices n ON n.id = q.notice_id
        WHERE q.status IN ('queued', 'retry')
      `)
      .all() as Array<{ id: number; publication_date: string }>;
    let canceled = 0;
    const cancel = this.database.connection.transaction(() => {
      for (const row of rows) {
        const failure = this.alertDateFailure(row.publication_date, now);
        if (!failure) continue;
        canceled += this.database.connection
          .prepare(`
            UPDATE delivery_queue
            SET status = 'permanent_failure', last_error_code = ?, failure_kind = 'canceled', updated_at = ?
            WHERE id = ? AND status IN ('queued', 'retry')
          `)
          .run(failure, now, row.id).changes;
      }
    });
    cancel();
    return canceled;
  }

  private cancelPermanently(id: number, code: string, now: string): void {
    this.database.connection
      .prepare("UPDATE delivery_queue SET status = 'permanent_failure', last_error_code = ?, failure_kind = 'canceled', updated_at = ? WHERE id = ? AND status IN ('queued', 'retry', 'sending')")
      .run(code, now, id);
  }

  private failPermanently(
    id: number,
    attempts: number,
    code: string,
    failureKind: "apns" | "internal",
    now: string,
  ): void {
    this.database.connection
      .prepare("UPDATE delivery_queue SET status = 'permanent_failure', attempts = ?, last_error_code = ?, failure_kind = ?, updated_at = ? WHERE id = ?")
      .run(attempts, code, failureKind, now, id);
  }
}
