import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PushMessage, PushSender } from "../src/apns.js";
import { AppDatabase } from "../src/database.js";
import { DeviceStore } from "../src/devices.js";
import { MAXIMUM_ALERT_AGE_MS, NotificationQueue } from "../src/queue.js";
import { FakeSender, queueCount, storedNotice } from "./helpers.js";

const databases: AppDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function enableDelivery(database: AppDatabase, now: string): void {
  database.updatePollState(
    {
      initialized: 1,
      last_success_at: now,
      gap_status: "normal",
      consecutive_failures: 0,
    },
    now,
  );
}

describe("notification queue", () => {
  it("retries transient failures and deduplicates across enqueue attempts", async () => {
    const database = new AppDatabase(":memory:");
    databases.push(database);
    const devices = new DeviceStore(database);
    const sender = new FakeSender([{ kind: "transient", code: "http_503" }, { kind: "success" }]);
    const queue = new NotificationQueue(database, devices, sender);
    const now = "2026-09-13T20:00:00.000Z";
    enableDelivery(database, now);
    const registration = devices.create("a".repeat(64), "sandbox", now);
    devices.setWatchlist(registration.deviceId, ["salmonella"], now);
    const notice = storedNotice("retry", now, "Salmonella recall");
    database.upsertNotice(notice);
    expect(queue.enqueueNotice(notice.id, now)).toBe(1);
    expect(queue.enqueueNotice(notice.id, now)).toBe(0);
    expect(queueCount(database)).toBe(1);

    expect(await queue.processDue(now)).toBe(1);
    expect(queue.health().retrying).toBe(1);
    expect(await queue.processDue("2026-09-13T20:00:29.000Z")).toBe(0);
    expect(await queue.processDue("2026-09-13T20:00:31.000Z")).toBe(1);
    expect(sender.messages).toHaveLength(2);
    expect(sender.messages[0]).toMatchObject({
      noticeId: notice.id,
      matchedTerm: "salmonella",
      matchedField: "title",
    });
    expect(
      (database.connection.prepare("SELECT status, attempts FROM delivery_queue").get() as { status: string; attempts: number }),
    ).toEqual({ status: "sent", attempts: 2 });
  });

  it("disables an invalid APNs token permanently", async () => {
    const database = new AppDatabase(":memory:");
    databases.push(database);
    const devices = new DeviceStore(database);
    const sender = new FakeSender([{ kind: "invalid", code: "BadDeviceToken" }]);
    const queue = new NotificationQueue(database, devices, sender);
    const now = "2026-09-13T20:00:00.000Z";
    enableDelivery(database, now);
    const registration = devices.create("a".repeat(64), "sandbox", now);
    devices.setWatchlist(registration.deviceId, ["salmonella"], now);
    const notice = storedNotice("bad-token", now, "Salmonella recall");
    database.upsertNotice(notice);
    queue.enqueueNotice(notice.id, now);
    await queue.processDue(now);
    expect(devices.get(registration.deviceId)).toMatchObject({ active: false, disabledReason: "BadDeviceToken" });
    expect(devices.authenticate(`${registration.deviceId}.${registration.clientSecret}`)).toBeNull();
    expect(() =>
      devices.updateToken(registration.deviceId, "b".repeat(64), "sandbox", "2026-09-13T20:01:00.000Z"),
    ).toThrow("superseded or disabled credentials");
    expect(queue.health().failed).toBe(1);
    expect(queue.health(now)).toMatchObject({
      recentApnsFailures: 1,
      lastApnsFailureAt: now,
      lastApnsFailureCode: "BadDeviceToken",
    });
  });

  it("preserves queue deduplication across database restarts", () => {
    const directory = mkdtempSync(join(tmpdir(), "beanstalk-queue-"));
    const path = join(directory, "service.sqlite");
    try {
      const firstDatabase = new AppDatabase(path);
      const firstDevices = new DeviceStore(firstDatabase);
      const sender = new FakeSender();
      const firstQueue = new NotificationQueue(firstDatabase, firstDevices, sender);
      const now = "2026-09-13T20:00:00.000Z";
      const registration = firstDevices.create("a".repeat(64), "sandbox", now);
      firstDevices.setWatchlist(registration.deviceId, ["salmonella"], now);
      const notice = storedNotice("restart", now, "Salmonella recall");
      firstDatabase.upsertNotice(notice);
      expect(firstQueue.enqueueNotice(notice.id, now)).toBe(1);
      firstDatabase.close();

      const reopened = new AppDatabase(path);
      const reopenedQueue = new NotificationQueue(reopened, new DeviceStore(reopened), sender);
      expect(reopenedQueue.enqueueNotice(notice.id, now)).toBe(0);
      expect(queueCount(reopened)).toBe(1);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("cancels unsent delivery when its watch term is removed", () => {
    const database = new AppDatabase(":memory:");
    databases.push(database);
    const devices = new DeviceStore(database);
    const queue = new NotificationQueue(database, devices, new FakeSender());
    const now = "2026-09-13T20:00:00.000Z";
    const registration = devices.create("a".repeat(64), "sandbox", now);
    devices.setWatchlist(registration.deviceId, ["salmonella"], now);
    const notice = storedNotice("opt-out", now, "Salmonella recall");
    database.upsertNotice(notice);
    queue.enqueueNotice(notice.id, now);
    devices.setWatchlist(registration.deviceId, [], "2026-09-13T20:00:01.000Z");
    expect(queue.health()).toMatchObject({ queued: 0, retrying: 0, failed: 1 });
  });

  it.each(["paused", "reconciling", "failed"] as const)("refuses delivery while poll gap status is %s", async (gapStatus) => {
    const database = new AppDatabase(":memory:");
    databases.push(database);
    const devices = new DeviceStore(database);
    const sender = new FakeSender();
    const queue = new NotificationQueue(database, devices, sender);
    const now = "2026-09-13T20:00:00.000Z";
    enableDelivery(database, now);
    const registration = devices.create("a".repeat(64), "sandbox", now);
    devices.setWatchlist(registration.deviceId, ["salmonella"], now);
    const notice = storedNotice(`gap-${gapStatus}`, now, "Salmonella recall");
    database.upsertNotice(notice);
    queue.enqueueNotice(notice.id, now);
    database.updatePollState({ gap_status: gapStatus }, now);
    expect(await queue.processDue(now)).toBe(0);
    expect(sender.messages).toHaveLength(0);
    expect(queue.health(now).queued).toBe(1);
  });

  it("stops the remaining batch when a gap is detected after a send", async () => {
    const database = new AppDatabase(":memory:");
    databases.push(database);
    const devices = new DeviceStore(database);
    const messages: PushMessage[] = [];
    const sender: PushSender = {
      configured: true,
      async send(message) {
        messages.push(message);
        database.updatePollState(
          { gap_status: "failed", gap_reason: "cursor disappeared during delivery" },
          "2026-09-13T20:00:01.000Z",
        );
        return { kind: "success" };
      },
      close() {},
    };
    const queue = new NotificationQueue(database, devices, sender);
    const now = "2026-09-13T20:00:00.000Z";
    enableDelivery(database, now);
    const registration = devices.create("a".repeat(64), "sandbox", now);
    devices.setWatchlist(registration.deviceId, ["salmonella"], now);
    for (const slug of ["gap-mid-batch-one", "gap-mid-batch-two"]) {
      const notice = storedNotice(slug, now, "Salmonella recall");
      database.upsertNotice(notice);
      queue.enqueueNotice(notice.id, now);
    }

    expect(await queue.processDue(now)).toBe(1);
    expect(messages).toHaveLength(1);
    expect(queue.health(now)).toMatchObject({ queued: 1, sending: 0 });
  });

  it("returns a claimed row to the queue when a gap appears immediately before send", async () => {
    const database = new AppDatabase(":memory:");
    databases.push(database);
    const devices = new DeviceStore(database);
    const sender = new FakeSender();
    const queue = new NotificationQueue(database, devices, sender);
    const now = "2026-09-13T20:00:00.000Z";
    enableDelivery(database, now);
    const registration = devices.create("a".repeat(64), "sandbox", now);
    devices.setWatchlist(registration.deviceId, ["salmonella"], now);
    const notice = storedNotice("gap-before-send", now, "Salmonella recall");
    database.upsertNotice(notice);
    queue.enqueueNotice(notice.id, now);
    const getPollState = database.getPollState.bind(database);
    let stateReads = 0;
    database.getPollState = () => {
      stateReads += 1;
      if (stateReads === 3) database.updatePollState({ gap_status: "paused" }, now);
      return getPollState();
    };

    expect(await queue.processDue(now)).toBe(0);
    expect(sender.messages).toHaveLength(0);
    expect(
      database.connection.prepare("SELECT status, last_error_code FROM delivery_queue").get(),
    ).toEqual({ status: "queued", last_error_code: "gap_paused" });
  });

  it("cancels stale, invalid, and future-dated backlog but permits the exact age boundary", async () => {
    const database = new AppDatabase(":memory:");
    databases.push(database);
    const devices = new DeviceStore(database);
    const sender = new FakeSender();
    const queue = new NotificationQueue(database, devices, sender);
    const nowMilliseconds = Date.parse("2026-09-13T20:00:00.000Z");
    const now = new Date(nowMilliseconds).toISOString();
    enableDelivery(database, now);
    const registration = devices.create("a".repeat(64), "sandbox", now);
    devices.setWatchlist(registration.deviceId, ["salmonella"], now);
    const fixtures = [
      { slug: "too-old-queued", date: new Date(nowMilliseconds - MAXIMUM_ALERT_AGE_MS - 1).toISOString() },
      { slug: "too-old-retry", date: new Date(nowMilliseconds - MAXIMUM_ALERT_AGE_MS - 1).toISOString() },
      { slug: "invalid-date", date: "" },
      { slug: "future-date", date: new Date(nowMilliseconds + 1).toISOString() },
      { slug: "exact-boundary", date: new Date(nowMilliseconds - MAXIMUM_ALERT_AGE_MS).toISOString() },
    ];
    for (const fixture of fixtures) {
      const notice = storedNotice(fixture.slug, fixture.date, "Salmonella recall");
      database.upsertNotice(notice);
      queue.enqueueNotice(notice.id, now);
    }
    database.connection
      .prepare(`
        UPDATE delivery_queue SET status = 'retry'
        WHERE notice_id = (SELECT id FROM notices WHERE canonical_url LIKE '%/too-old-retry')
      `)
      .run();

    expect(await queue.processDue(now)).toBe(1);
    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]?.noticeId).toBe(
      database.connection.prepare("SELECT id FROM notices WHERE canonical_url LIKE '%/exact-boundary'").pluck().get(),
    );
    const outcomes = database.connection
      .prepare(`
        SELECT n.canonical_url, q.status, q.last_error_code
        FROM delivery_queue q JOIN notices n ON n.id = q.notice_id ORDER BY n.canonical_url
      `)
      .all()
      .map((row) => {
        const outcome = row as { canonical_url: string; status: string; last_error_code: string | null };
        return {
          slug: outcome.canonical_url.split("/").at(-1),
          status: outcome.status,
          last_error_code: outcome.last_error_code,
        };
      });
    expect(outcomes).toEqual([
      { slug: "exact-boundary", status: "sent", last_error_code: null },
      { slug: "future-date", status: "permanent_failure", last_error_code: "notice_date_future" },
      { slug: "invalid-date", status: "permanent_failure", last_error_code: "notice_date_invalid" },
      { slug: "too-old-queued", status: "permanent_failure", last_error_code: "alert_expired" },
      { slug: "too-old-retry", status: "permanent_failure", last_error_code: "alert_expired" },
    ]);
  });

  it("prunes every delivery status at 30 days and expires inactive device watchlists", () => {
    const database = new AppDatabase(":memory:");
    databases.push(database);
    const devices = new DeviceStore(database);
    const queue = new NotificationQueue(database, devices, new FakeSender());
    const old = "2026-08-01T00:00:00.000Z";
    const cutoff = "2026-08-14T00:00:00.000Z";
    const registration = devices.create("a".repeat(64), "sandbox", old);
    devices.setWatchlist(registration.deviceId, ["salmonella"], old);
    for (const slug of ["old-queued", "old-retry", "old-sending", "old-sent", "old-failed"]) {
      const notice = storedNotice(slug, old, "Salmonella recall");
      database.upsertNotice(notice);
      queue.enqueueNotice(notice.id, old);
    }
    const statuses = ["queued", "retry", "sending", "sent", "permanent_failure"];
    const rows = database.connection.prepare("SELECT id FROM delivery_queue ORDER BY id").all() as Array<{ id: number }>;
    rows.forEach((row, index) => {
      database.connection.prepare("UPDATE delivery_queue SET status = ? WHERE id = ?").run(statuses[index], row.id);
    });
    expect(queue.prune(cutoff)).toBe(5);
    devices.disable(registration.deviceId, "replaced", old);
    expect(devices.pruneInactive(cutoff)).toBe(1);
    expect(devices.get(registration.deviceId)).toBeNull();
    expect((database.connection.prepare("SELECT COUNT(*) AS count FROM watch_terms").get() as { count: number }).count).toBe(0);
  });

  it("makes replaced registration credentials terminal without letting them reclaim the current token", () => {
    const database = new AppDatabase(":memory:");
    databases.push(database);
    const devices = new DeviceStore(database);
    const queue = new NotificationQueue(database, devices, new FakeSender());
    const now = "2026-09-13T20:00:00.000Z";
    const prior = devices.create("a".repeat(64), "sandbox", now);
    devices.setWatchlist(prior.deviceId, ["salmonella"], now);
    for (const slug of ["queued-job", "retry-job", "sending-job"]) {
      const notice = storedNotice(slug, now, "Salmonella recall");
      database.upsertNotice(notice);
      queue.enqueueNotice(notice.id, now);
    }
    database.connection
      .prepare("UPDATE delivery_queue SET status = 'retry' WHERE id = (SELECT id FROM delivery_queue ORDER BY id LIMIT 1 OFFSET 1)")
      .run();
    database.connection
      .prepare("UPDATE delivery_queue SET status = 'sending' WHERE id = (SELECT id FROM delivery_queue ORDER BY id LIMIT 1 OFFSET 2)")
      .run();

    const replacement = devices.create("a".repeat(64), "sandbox", "2026-09-13T20:01:00.000Z");

    expect(devices.get(prior.deviceId)).toMatchObject({ active: false, disabledReason: "replaced" });
    expect(devices.get(replacement.deviceId)).toMatchObject({ active: true, environment: "sandbox" });
    expect(devices.authenticate(`${prior.deviceId}.${prior.clientSecret}`)).toBeNull();
    expect(() =>
      devices.updateToken(prior.deviceId, "a".repeat(64), "sandbox", "2026-09-13T20:02:00.000Z"),
    ).toThrow("superseded or disabled credentials");
    expect(() =>
      devices.updateToken(prior.deviceId, "b".repeat(64), "sandbox", "2026-09-13T20:02:00.000Z"),
    ).toThrow("superseded or disabled credentials");
    expect(devices.get(replacement.deviceId)).toMatchObject({
      active: true,
      deviceToken: "a".repeat(64),
    });
    const jobs = database.connection
      .prepare("SELECT status, last_error_code FROM delivery_queue ORDER BY id")
      .all() as Array<{ status: string; last_error_code: string }>;
    expect(jobs).toEqual([
      { status: "permanent_failure", last_error_code: "device_replaced" },
      { status: "permanent_failure", last_error_code: "device_replaced" },
      { status: "permanent_failure", last_error_code: "device_replaced" },
    ]);
    expect(queue.health()).toMatchObject({ queued: 0, retrying: 0, sending: 0, failed: 3 });
  });
});
