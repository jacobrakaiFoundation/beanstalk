import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database.js";
import { DeviceStore } from "../src/devices.js";
import { FdaPoller } from "../src/poller.js";
import { NotificationQueue } from "../src/queue.js";
import { annual, FakeSender, FakeSource, queueCount, rss, storedNotice } from "./helpers.js";

const databases: AppDatabase[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));

function context() {
  const database = new AppDatabase(":memory:");
  databases.push(database);
  const devices = new DeviceStore(database);
  const registration = devices.create("a".repeat(64), "sandbox", "2026-09-13T20:00:00.000Z");
  devices.setWatchlist(registration.deviceId, ["salmonella"], "2026-09-13T20:00:00.000Z");
  const sender = new FakeSender();
  const queue = new NotificationQueue(database, devices, sender);
  const source = new FakeSource();
  const clock = { now: new Date("2026-09-13T20:00:00.000Z") };
  const poller = new FdaPoller(database, queue, source, () => clock.now);
  return { database, source, clock, poller, queue, sender };
}

const oldItem = { slug: "original", title: "Original recall", date: "Sun, 13 Sep 2026 12:00:00 EDT" };
const newItem = { slug: "addition", title: "New recall", date: "Sun, 13 Sep 2026 14:00:00 EDT" };

describe("authoritative recall corrections", () => {
  it("refreshes the same cursor URL and older feed entries without alerting corrections or reordered history", async () => {
    const { database, source, clock, poller } = context();
    source.rss = rss([oldItem]);
    await poller.pollOnce();
    source.rss = rss([newItem, oldItem]);
    await poller.pollOnce();
    expect(queueCount(database)).toBe(1);

    for (const slug of [oldItem.slug, newItem.slug]) {
      const identity = storedNotice(slug, "2026-09-13T00:00:00.000Z");
      const document = await source.fetchAnnouncement(identity.sourceURL);
      source.announcementDocuments.set(identity.sourceURL, {
        ...document,
        html: document.html
          .replace("LOT-123", "EXPANDED-LOT-999")
          .replace("Potential Salmonella contamination", "Undeclared milk")
          .replace("Fixture food", "Expanded food selection"),
      });
    }
    source.announcementFetches = 0;
    clock.now = new Date("2026-09-13T20:15:00.000Z");
    expect(await poller.pollOnce()).toEqual({ kind: "updated", newNoticeCount: 0, queuedCount: 0 });
    expect(source.announcementFetches).toBe(2);
    for (const slug of [oldItem.slug, newItem.slug]) {
      const notice = database.getStoredNotice(storedNotice(slug, "2026-09-13T00:00:00.000Z").id);
      expect(notice).toMatchObject({
        reasonForRecall: "Undeclared milk",
        productDescription: "Expanded food selection",
        retrievedAt: clock.now.toISOString(),
        eligibleForAlert: slug === newItem.slug,
      });
      expect(notice?.codeInfo).toContain("EXPANDED-LOT-999");
      expect(notice?.codeInfo).not.toContain("LOT-123");
      expect(notice?.publicationDate).toBe(slug === newItem.slug ? "2026-09-13T18:00:00.000Z" : "2026-09-13T16:00:00.000Z");
    }
    source.rss = rss([oldItem, newItem]);
    expect(await poller.pollOnce()).toEqual({ kind: "updated", newNoticeCount: 0, queuedCount: 0 });
    expect(queueCount(database)).toBe(1);
  });

  it("keeps the previous complete snapshot and retrieval time when its refresh fails", async () => {
    const { database, source, clock, poller } = context();
    source.rss = rss([oldItem]);
    await poller.pollOnce();
    const identity = storedNotice(oldItem.slug, "2026-09-13T00:00:00.000Z");
    const previous = database.getStoredNotice(identity.id);
    clock.now = new Date("2026-09-13T20:15:00.000Z");
    source.announcementError = new Error("updated announcement unavailable");
    await expect(poller.pollOnce()).rejects.toThrow("updated announcement unavailable");
    expect(database.getStoredNotice(identity.id)).toEqual(previous);
    expect(database.getPollState()).toMatchObject({ gapStatus: "failed", lastSuccessAt: previous?.retrievedAt });
    expect(queueCount(database)).toBe(0);
  });

  it("replaces cleared fields and classification, while rejecting older snapshots and annual downgrades", () => {
    const { database } = context();
    const original = {
      ...storedNotice("corrected", "2026-09-13T16:00:00.000Z"),
      codeInfo: "OLD-LOT",
      reasonForRecall: "Undeclared egg",
      distribution: "Old distribution",
      classification: "Class I",
    };
    database.upsertNotice(original);
    const correction = {
      ...original,
      codeInfo: null,
      reasonForRecall: "Undeclared milk",
      distribution: null,
      classification: null,
      foodClassification: "unknown" as const,
      retrievedAt: "2026-09-13T20:15:00.000Z",
    };
    database.upsertNotice(correction);
    expect(database.getStoredNotice(original.id)).toEqual(correction);
    database.upsertNotice(original);
    expect(database.getStoredNotice(original.id)).toEqual(correction);
    database.upsertNotice({
      ...original,
      sourceKind: "annual",
      title: "Annual summary",
      retrievedAt: "2026-09-13T20:30:00.000Z",
      eligibleForAlert: false,
    });
    expect(database.getStoredNotice(original.id)).toEqual(correction);
    expect(database.listNotices({ limit: 10 }).items).toEqual([]);
  });

  it("upgrades annual content to authoritative RSS and permits newer annual-only corrections", () => {
    const { database } = context();
    const original = { ...storedNotice("annual-record", "2026-09-13T16:00:00.000Z"), sourceKind: "annual" as const, eligibleForAlert: false };
    database.upsertNotice(original);
    database.upsertNotice({ ...original, reasonForRecall: "Corrected reason", retrievedAt: "2026-09-13T20:15:00.000Z" });
    expect(database.getStoredNotice(original.id)?.reasonForRecall).toBe("Corrected reason");
    database.upsertNotice({ ...original, sourceKind: "rss", summary: "Complete official announcement", codeInfo: "LOT-456" });
    expect(database.getStoredNotice(original.id)).toMatchObject({
      sourceKind: "rss", summary: "Complete official announcement", codeInfo: "LOT-456", eligibleForAlert: false,
    });
  });
});

describe("mixed-product RSS gap recovery", () => {
  it("recovers a non-food cursor from a non-food-only annual document and alerts only new food", async () => {
    const { database, source, clock, poller, queue, sender } = context();
    const drugItem = { ...oldItem, slug: "drug-cursor", title: "Epinephrine injection recall" };
    const nextDrugItem = { ...newItem, slug: "another-drug", title: "Another injection recall" };
    for (const slug of [drugItem.slug, nextDrugItem.slug]) {
      const identity = storedNotice(slug, "2026-09-13T00:00:00.000Z");
      const document = await source.fetchAnnouncement(identity.sourceURL);
      source.announcementDocuments.set(identity.sourceURL, {
        ...document, html: document.html.replace("Food &amp; Beverages", "Drugs"),
      });
    }
    source.rss = rss([drugItem]);
    await poller.pollOnce();
    clock.now = new Date("2026-09-13T20:15:00.000Z");
    source.rss = rss([nextDrugItem, newItem]);
    source.annual = [annual([{ slug: drugItem.slug, date: "09/13/2026" }])
      .replace("Food &amp; Beverages, Foodborne Illness", "Drugs")];
    expect(await poller.pollOnce()).toEqual({ kind: "reconciled", newNoticeCount: 2, queuedCount: 1 });
    expect(database.getPollState()).toMatchObject({ gapStatus: "normal", consecutiveFailures: 0 });
    expect(database.listNotices({ limit: 10 }).items.map((notice) => notice.id)).toEqual([
      storedNotice(newItem.slug, "2026-09-13T00:00:00.000Z").id,
    ]);
    expect(queueCount(database)).toBe(1);
    await queue.processDue(clock.now.toISOString());
    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]?.noticeId).toBe(storedNotice(newItem.slug, "2026-09-13T00:00:00.000Z").id);
    expect(await poller.pollOnce()).toEqual({ kind: "updated", newNoticeCount: 0, queuedCount: 0 });
  });
});
