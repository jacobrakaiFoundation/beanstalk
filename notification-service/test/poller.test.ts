import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database.js";
import { DeviceStore } from "../src/devices.js";
import { FdaPoller } from "../src/poller.js";
import { NotificationQueue } from "../src/queue.js";
import { annual, FakeSender, FakeSource, queueCount, rss } from "./helpers.js";

const databases: AppDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function context(sender = new FakeSender()) {
  const database = new AppDatabase(":memory:");
  databases.push(database);
  const devices = new DeviceStore(database);
  const queue = new NotificationQueue(database, devices, sender);
  const source = new FakeSource();
  const clock = { now: new Date("2026-09-13T20:00:00.000Z") };
  const poller = new FdaPoller(database, queue, source, () => clock.now);
  const registration = devices.create("a".repeat(64), "sandbox", clock.now.toISOString());
  devices.setWatchlist(registration.deviceId, ["salmonella"], clock.now.toISOString());
  return { database, devices, queue, source, clock, poller, sender };
}

describe("FDA poller", () => {
  it("seeds existing history silently and only queues later RSS additions", async () => {
    const { database, source, clock, poller } = context();
    source.rss = rss([{ slug: "old", title: "Old Salmonella recall", date: "Fri, 11 Sep 2026 18:15:00 EDT" }]);
    expect(await poller.pollOnce()).toEqual({ kind: "seeded", noticeCount: 1 });
    expect(queueCount(database)).toBe(0);
    expect(source.announcementFetches).toBe(1);
    const seededSource = database.connection.prepare("SELECT source_url FROM notices").get() as { source_url: string };
    expect(seededSource.source_url).toMatch(/^https:\/\//u);

    clock.now = new Date("2026-09-13T20:15:00.000Z");
    source.rss = rss([
      { slug: "new", title: "New Salmonella recall", date: "Sun, 13 Sep 2026 12:00:00 EDT" },
      { slug: "old", title: "Old Salmonella recall", date: "Fri, 11 Sep 2026 18:15:00 EDT" },
    ]);
    expect(await poller.pollOnce()).toEqual({ kind: "updated", newNoticeCount: 1, queuedCount: 1 });
    expect(queueCount(database)).toBe(1);
    expect(source.announcementFetches).toBe(3);
  });

  it("pauses when a gap cannot be proven against official annual XML", async () => {
    const { database, source, clock, poller } = context();
    source.rss = rss([{ slug: "cursor", title: "Old recall", date: "Fri, 11 Sep 2026 18:15:00 EDT" }]);
    await poller.pollOnce();
    clock.now = new Date("2026-09-13T20:15:00.000Z");
    source.rss = rss([{ slug: "new", title: "New Salmonella recall", date: "Sun, 13 Sep 2026 12:00:00 EDT" }]);
    source.annual = [annual([{ slug: "different", date: "09/10/2026" }])];
    expect(await poller.pollOnce()).toMatchObject({ kind: "gap-paused" });
    expect(database.getPollState().gapStatus).toBe("failed");
    expect(queueCount(database)).toBe(0);
  });

  it("reconciles a prior-year cursor without alerting annual-only backfill", async () => {
    const { database, source, clock, poller } = context();
    source.rss = rss([
      { slug: "december-cursor", title: "December food recall", date: "Wed, 31 Dec 2025 12:00:00 EST" },
    ]);
    await poller.pollOnce();
    clock.now = new Date("2026-01-02T20:00:00.000Z");
    source.rss = rss([{ slug: "january-new", title: "January Salmonella recall", date: "Fri, 02 Jan 2026 12:00:00 EST" }]);
    source.annual = [
      annual([{ slug: "january-new", date: "01/02/2026" }]),
      annual([
        { slug: "december-cursor", date: "12/31/2025" },
        { slug: "annual-only-old", date: "12/01/2025", reason: "Salmonella" },
      ]),
    ];
    expect(await poller.pollOnce()).toEqual({ kind: "reconciled", newNoticeCount: 1, queuedCount: 1 });
    expect(database.getPollState().gapStatus).toBe("normal");
    const queued = database.connection
      .prepare("SELECT n.canonical_url FROM delivery_queue q JOIN notices n ON n.id = q.notice_id")
      .all() as { canonical_url: string }[];
    expect(queued).toHaveLength(1);
    expect(queued[0]?.canonical_url).toContain("january-new");
    const annualOnly = database.connection
      .prepare("SELECT eligible_for_alert FROM notices WHERE canonical_url LIKE '%annual-only-old'")
      .get() as { eligible_for_alert: number };
    expect(annualOnly.eligible_for_alert).toBe(0);
  });

  it("pauses alerts and stores no truncated row when announcement enrichment fails", async () => {
    const { database, source, clock, poller } = context();
    source.rss = rss([{ slug: "old", title: "Old recall", date: "Fri, 11 Sep 2026 18:15:00 EDT" }]);
    await poller.pollOnce();
    clock.now = new Date("2026-09-13T20:15:00.000Z");
    source.rss = rss([
      { slug: "incomplete-new", title: "Truncated Salmonella text", date: "Sun, 13 Sep 2026 12:00:00 EDT" },
      { slug: "old", title: "Old recall", date: "Fri, 11 Sep 2026 18:15:00 EDT" },
    ]);
    source.announcementError = new Error("announcement unavailable");
    await expect(poller.pollOnce()).rejects.toThrow("announcement unavailable");
    expect(database.getPollState()).toMatchObject({ gapStatus: "failed", consecutiveFailures: 1 });
    expect(queueCount(database)).toBe(0);
    expect(
      (database.connection.prepare("SELECT COUNT(*) AS count FROM notices WHERE canonical_url LIKE '%incomplete-new'").get() as {
        count: number;
      }).count,
    ).toBe(0);
  });

  it("bounds linked-announcement enrichment concurrency", async () => {
    const { database, queue, source, clock } = context();
    source.rss = rss(
      Array.from({ length: 5 }, (_, index) => ({
        slug: `bounded-${index}`,
        title: `Recall ${index}`,
        date: `Sun, 13 Sep 2026 1${index}:00:00 EDT`,
      })),
    );
    const fetchAnnouncement = source.fetchAnnouncement.bind(source);
    let active = 0;
    let maximumActive = 0;
    source.fetchAnnouncement = async (url) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      try {
        return await fetchAnnouncement(url);
      } finally {
        active -= 1;
      }
    };
    const logger = { info: () => {}, warn: () => {}, error: () => {} };
    const boundedPoller = new FdaPoller(database, queue, source, () => clock.now, logger, 2);
    await boundedPoller.pollOnce();
    expect(maximumActive).toBe(2);
    expect(source.announcementFetches).toBe(5);
  });
});
