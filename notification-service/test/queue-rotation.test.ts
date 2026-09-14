import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database.js";
import { DeviceStore, type DeviceRegistration } from "../src/devices.js";
import type { PushMessage, PushSender } from "../src/push.js";
import { NotificationQueue } from "../src/queue.js";
import { storedNotice } from "./helpers.js";

const now = "2026-09-13T20:00:00.000Z";
const databases: AppDatabase[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function fixture(initial: DeviceRegistration, send: PushSender["send"]) {
  const database = new AppDatabase(":memory:");
  databases.push(database);
  database.updatePollState({ initialized: 1, gap_status: "normal", last_success_at: now }, now);
  const devices = new DeviceStore(database);
  const registration = devices.create(initial, now);
  devices.setWatchlist(registration.deviceId, ["salmonella"], now);
  const sender: PushSender = { configured: true, isConfigured: () => true, send, close() {} };
  const queue = new NotificationQueue(database, devices, sender);
  const notices = ["first", "second"].map((slug) => storedNotice(slug, now, "Salmonella recall"));
  for (const notice of notices) {
    database.upsertNotice(notice);
    queue.enqueueNotice(notice.id, now);
  }
  return { database, devices, registration, queue, notices };
}

const destinations: Array<{ name: string; old: DeviceRegistration; replacement: DeviceRegistration }> = [
  {
    name: "APNs token",
    old: { provider: "apns", pushIdentifier: "a".repeat(64), environment: "sandbox" },
    replacement: { provider: "apns", pushIdentifier: "b".repeat(64), environment: "sandbox" },
  },
  {
    name: "APNs environment",
    old: { provider: "apns", pushIdentifier: "a".repeat(64), environment: "sandbox" },
    replacement: { provider: "apns", pushIdentifier: "a".repeat(64), environment: "production" },
  },
  {
    name: "FCM identifier",
    old: { provider: "fcm", pushIdentifier: "oldFirebaseInstallation", identifierKind: "fid" },
    replacement: { provider: "fcm", pushIdentifier: "newFirebaseInstallation", identifierKind: "fid" },
  },
];

describe("delivery destination rotation", () => {
  it.each(destinations)("retries a rejected old $name without disabling its replacement", async ({ old, replacement }) => {
    const messages: PushMessage[] = [];
    const state = fixture(old, async (message) => {
      messages.push(message);
      if (messages.length === 1) {
        state.devices.updateToken(state.registration.deviceId, replacement, now);
        return { kind: "invalid", code: "Unregistered" };
      }
      return { kind: "success" };
    });
    await state.queue.processDue(now);
    expect(state.devices.get(state.registration.deviceId)).toMatchObject({
      active: true, disabledReason: null, pushIdentifier: replacement.pushIdentifier,
    });
    expect(state.queue.health(now)).toMatchObject({ retrying: 1, failed: 0 });
    expect(messages[1]).toMatchObject({
      pushIdentifier: replacement.pushIdentifier,
      environment: replacement.provider === "apns" ? replacement.environment : null,
    });
    await state.queue.processDue(now);
    expect(messages).toHaveLength(3);
    expect(messages[2]?.noticeId).toBe(state.notices[0]?.id);
    expect(messages[2]?.pushIdentifier).toBe(replacement.pushIdentifier);
    expect(state.database.connection.prepare("SELECT status FROM delivery_queue").all())
      .toEqual([{ status: "sent" }, { status: "sent" }]);
  });

  it("resolves later jobs after a successful send rotates the destination", async () => {
    const messages: PushMessage[] = [];
    const { old, replacement } = destinations[0]!;
    const state = fixture(old, async (message) => {
      messages.push(message);
      if (messages.length === 1) state.devices.updateToken(state.registration.deviceId, replacement, now);
      return { kind: "success" };
    });
    await state.queue.processDue(now);
    expect(messages.map((message) => message.pushIdentifier)).toEqual([old.pushIdentifier, replacement.pushIdentifier]);
    expect(state.queue.health(now)).toMatchObject({ queued: 0, retrying: 0, failed: 0 });
  });

  it("does not deliver later batch items whose corrected hazard no longer matches", async () => {
    const messages: PushMessage[] = [];
    const state = fixture(destinations[0]!.old, async (message) => {
      messages.push(message);
      state.database.connection.prepare("UPDATE notices SET title = 'Undeclared milk', summary = 'Milk allergen' WHERE id = ?")
        .run(state.notices[1]!.id);
      return { kind: "success" };
    });
    await state.queue.processDue(now);
    expect(messages).toHaveLength(1);
    expect(state.database.connection.prepare("SELECT status, last_error_code FROM delivery_queue WHERE notice_id = ?")
      .get(state.notices[1]!.id)).toEqual({ status: "permanent_failure", last_error_code: "watchlist_changed" });
  });
});
