import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Writable } from "node:stream";
import { buildApp } from "../src/app.js";
import { AppDatabase } from "../src/database.js";
import { DeviceStore } from "../src/devices.js";
import { NotificationQueue } from "../src/queue.js";
import { FakeSender, storedNotice } from "./helpers.js";

const openApps: FastifyInstance[] = [];
const openDatabases: AppDatabase[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
  openDatabases.splice(0).forEach((database) => database.close());
});

async function context() {
  const database = new AppDatabase(":memory:");
  const devices = new DeviceStore(database);
  const sender = new FakeSender([], false);
  const queue = new NotificationQueue(database, devices, sender);
  const app = await buildApp({
    database,
    devices,
    queue,
    sender,
    now: () => new Date("2026-09-13T20:00:00.000Z"),
  });
  openApps.push(app);
  openDatabases.push(database);
  return { app, database };
}

describe("device API", () => {
  it("authenticates, rotates the APNs token, and deletes all device data", async () => {
    const { app, database } = await context();
    const registration = await app.inject({
      method: "POST",
      url: "/v1/devices",
      payload: { deviceToken: "a".repeat(64), environment: "sandbox" },
    });
    expect(registration.statusCode).toBe(201);
    const credentials = registration.json<{ deviceId: string; clientSecret: string }>();
    const stored = database.connection
      .prepare("SELECT secret_hash, device_token FROM devices WHERE id = ?")
      .get(credentials.deviceId) as { secret_hash: string; device_token: string };
    expect(stored.secret_hash).not.toContain(credentials.clientSecret);
    expect(stored.secret_hash).toHaveLength(64);
    expect(stored.device_token).toBe("a".repeat(64));
    const authorization = `Bearer ${credentials.deviceId}.${credentials.clientSecret}`;

    const watchlist = await app.inject({
      method: "PUT",
      url: "/v1/devices/me/watchlist",
      headers: { authorization },
      payload: { terms: [" Salmonella ", "COD"] },
    });
    expect(watchlist.statusCode).toBe(200);
    expect(watchlist.json()).toEqual({ terms: ["salmonella", "cod"] });

    const rotation = await app.inject({
      method: "PUT",
      url: "/v1/devices/me/token",
      headers: { authorization },
      payload: { deviceToken: "b".repeat(64), environment: "production" },
    });
    expect(rotation.statusCode).toBe(200);
    expect(rotation.json()).toMatchObject({ environment: "production", active: true, terms: ["cod", "salmonella"] });
    expect(JSON.stringify(rotation.json())).not.toContain("deviceToken");

    const deletion = await app.inject({ method: "DELETE", url: "/v1/devices/me", headers: { authorization } });
    expect(deletion.statusCode).toBe(204);
    expect((database.connection.prepare("SELECT COUNT(*) AS count FROM watch_terms").get() as { count: number }).count).toBe(0);
    expect((await app.inject({ method: "GET", url: "/v1/devices/me", headers: { authorization } })).statusCode).toBe(401);
  });

  it("rejects bad credentials and invalid input", async () => {
    const { app } = await context();
    expect((await app.inject({ method: "GET", url: "/v1/devices/me" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/devices",
          payload: { deviceToken: "not-a-token", environment: "sandbox" },
        })
      ).statusCode,
    ).toBe(400);
  });

  it("transfers a registration once and prevents old or unrelated credentials from reclaiming its token", async () => {
    const { app, database } = await context();
    const initial = await app.inject({
      method: "POST",
      url: "/v1/devices",
      payload: { deviceToken: "a".repeat(64), environment: "sandbox" },
    });
    const initialCredentials = initial.json<{ deviceId: string; clientSecret: string }>();
    const replacement = await app.inject({
      method: "POST",
      url: "/v1/devices",
      payload: { deviceToken: "a".repeat(64), environment: "sandbox" },
    });
    const replacementCredentials = replacement.json<{ deviceId: string; clientSecret: string }>();
    const unrelated = await app.inject({
      method: "POST",
      url: "/v1/devices",
      payload: { deviceToken: "b".repeat(64), environment: "sandbox" },
    });
    const unrelatedCredentials = unrelated.json<{ deviceId: string; clientSecret: string }>();

    const oldAuthorization = `Bearer ${initialCredentials.deviceId}.${initialCredentials.clientSecret}`;
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/v1/devices/me/token",
          headers: { authorization: oldAuthorization },
          payload: { deviceToken: "c".repeat(64), environment: "sandbox" },
        })
      ).statusCode,
    ).toBe(401);

    const collision = await app.inject({
      method: "PUT",
      url: "/v1/devices/me/token",
      headers: { authorization: `Bearer ${unrelatedCredentials.deviceId}.${unrelatedCredentials.clientSecret}` },
      payload: { deviceToken: "a".repeat(64), environment: "sandbox" },
    });
    expect(collision.statusCode).toBe(400);
    expect(collision.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(
      database.connection
        .prepare("SELECT id, device_token, active FROM devices WHERE active = 1 ORDER BY id")
        .all(),
    ).toEqual(
      [
        { id: replacementCredentials.deviceId, device_token: "a".repeat(64), active: 1 },
        { id: unrelatedCredentials.deviceId, device_token: "b".repeat(64), active: 1 },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
  });
});

describe("notice API", () => {
  it("paginates after filtering and returns the stable iPhone wire shape", async () => {
    const { app, database } = await context();
    database.upsertNotice(storedNotice("milk-new", "2026-09-13T03:00:00.000Z", "Milk recall newest"));
    database.upsertNotice(storedNotice("other", "2026-09-13T02:00:00.000Z", "Bread recall"));
    database.upsertNotice(storedNotice("milk-old", "2026-09-13T01:00:00.000Z", "Milk recall oldest"));
    const first = await app.inject({ method: "GET", url: "/v1/notices?query=milk&limit=1" });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json<{ items: Record<string, unknown>[]; nextCursor: string }>();
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.nextCursor).toBeTypeOf("string");
    expect(Object.keys(firstBody.items[0] ?? {}).sort()).toEqual(
      [
        "id",
        "title",
        "summary",
        "productDescription",
        "reasonForRecall",
        "companyName",
        "classification",
        "status",
        "distribution",
        "codeInfo",
        "publicationDate",
        "recallInitiationDate",
        "retrievedAt",
        "sourceURL",
      ].sort(),
    );
    const second = await app.inject({
      method: "GET",
      url: `/v1/notices?query=milk&limit=1&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    });
    expect(second.json<{ items: Array<{ title: string }>; nextCursor: null }>().items[0]?.title).toBe("Milk recall oldest");
    expect(second.json<{ items: unknown[]; nextCursor: null }>().nextCursor).toBeNull();
  });

  it("reports degraded health when only push credentials are absent", async () => {
    const { app, database } = await context();
    database.updatePollState(
      {
        initialized: 1,
        last_success_at: "2026-09-13T20:00:00.000Z",
        gap_status: "normal",
        consecutive_failures: 0,
      },
      "2026-09-13T20:00:00.000Z",
    );
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "degraded",
      database: "ok",
      pushDisabled: true,
      poll: { initialized: true, stale: false },
    });
  });

  it("returns HTTP 503 while polling is uninitialized", async () => {
    const { app } = await context();
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "unhealthy", poll: { initialized: false, stale: true } });
  });

  it("returns HTTP 503 when polling is stale", async () => {
    const database = new AppDatabase(":memory:");
    const devices = new DeviceStore(database);
    const sender = new FakeSender();
    const queue = new NotificationQueue(database, devices, sender);
    const current = "2026-09-13T20:00:00.000Z";
    database.updatePollState(
      { initialized: 1, last_success_at: "2026-09-13T18:00:00.000Z", gap_status: "normal" },
      current,
    );
    const app = await buildApp({
      database,
      devices,
      queue,
      sender,
      now: () => new Date(current),
      pollStaleAfterMs: 30 * 60 * 1000,
    });
    openApps.push(app);
    openDatabases.push(database);
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(503);
    const health = response.json();
    expect(health).toMatchObject({
      status: "unhealthy",
      pushDisabled: false,
      poll: { initialized: true, stale: true },
      queue: { recentApnsFailures: 0 },
    });
  });

  it("returns HTTP 503 for a recent permanent APNs failure", async () => {
    const database = new AppDatabase(":memory:");
    const devices = new DeviceStore(database);
    const sender = new FakeSender([{ kind: "invalid", code: "BadDeviceToken" }]);
    const queue = new NotificationQueue(database, devices, sender);
    const current = "2026-09-13T20:00:00.000Z";
    database.updatePollState(
      { initialized: 1, last_success_at: current, gap_status: "normal", consecutive_failures: 0 },
      current,
    );
    const registration = devices.create("a".repeat(64), "sandbox", current);
    devices.setWatchlist(registration.deviceId, ["salmonella"], current);
    const notice = storedNotice("health-failure", current, "Salmonella recall");
    database.upsertNotice(notice);
    queue.enqueueNotice(notice.id, current);
    await queue.processDue(current);
    const app = await buildApp({
      database,
      devices,
      queue,
      sender,
      now: () => new Date(current),
      pollStaleAfterMs: 30 * 60 * 1000,
    });
    openApps.push(app);
    openDatabases.push(database);
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "unhealthy",
      pushDisabled: false,
      poll: { initialized: true, stale: false },
      queue: { recentApnsFailures: 1, lastApnsFailureAt: current },
    });
  });

  it("logs route and status without retaining query terms, tokens, or remote IP", async () => {
    const chunks: string[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const database = new AppDatabase(":memory:");
    const devices = new DeviceStore(database);
    const sender = new FakeSender([], false);
    const queue = new NotificationQueue(database, devices, sender);
    const app = await buildApp({ database, devices, queue, sender, logger: true, trustProxy: true, logStream });
    openApps.push(app);
    openDatabases.push(database);
    await app.inject({
      method: "GET",
      url: "/v1/notices?query=private-milk-term",
      headers: { "x-forwarded-for": "203.0.113.44" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/devices",
      payload: { deviceToken: "c".repeat(64), environment: "sandbox" },
    });
    const logs = chunks.join("");
    expect(logs).toContain('"route":"/v1/notices"');
    expect(logs).toContain('"statusCode":200');
    expect(logs).not.toContain("private-milk-term");
    expect(logs).not.toContain("203.0.113.44");
    expect(logs).not.toContain("c".repeat(64));
  });
});
