import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database.js";
import { DeviceStore } from "../src/devices.js";
import type { PushMessage, PushSender } from "../src/apns.js";
import { NotificationQueue } from "../src/queue.js";
import { storedNotice } from "./helpers.js";

const now = "2026-09-13T20:00:00.000Z";
const databases: AppDatabase[] = [];

afterEach(() => databases.splice(0).forEach((database) => database.close()));

describe("delivery destination rotation", () => {
    it("does not disable a replacement token when an old send is rejected", async () => {
        const database = new AppDatabase(":memory:");
        databases.push(database);
        database.updatePollState({ initialized: 1, gap_status: "normal", last_success_at: now }, now);
        const devices = new DeviceStore(database);
        const registration = devices.create("a".repeat(64), "sandbox", now);
        devices.setWatchlist(registration.deviceId, ["salmonella"], now);
        const notice = storedNotice("rotated-token", now, "Salmonella recall");
        database.upsertNotice(notice);
        const messages: PushMessage[] = [];
        const sender: PushSender = {
            configured: true,
            async send(message) {
                messages.push(message);
                devices.updateToken(registration.deviceId, "b".repeat(64), "sandbox", now);
                return { kind: "invalid", code: "Unregistered" };
            },
            close() {},
        };
        const queue = new NotificationQueue(database, devices, sender);
        queue.enqueueNotice(notice.id, now);

        await queue.processDue(now);

        expect(messages).toHaveLength(1);
        expect(devices.get(registration.deviceId)).toMatchObject({
            active: true,
            deviceToken: "b".repeat(64),
            disabledReason: null,
        });
        expect(database.connection.prepare("SELECT status, last_error_code FROM delivery_queue").all())
            .toEqual([{ status: "retry", last_error_code: "destination_rotated" }]);
    });
});
