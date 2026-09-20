import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database.js";
import { storedNotice } from "./helpers.js";

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

describe("database file protections", () => {
  it("refuses a relative path instead of changing the working directory mode", () => {
    expect(() => new AppDatabase("service.sqlite")).toThrow("absolute and inside a dedicated data directory");
  });

  it("enforces a restrictive umask and modes on an existing data directory, database, WAL, and SHM", () => {
    const root = mkdtempSync(join(tmpdir(), "beanstalk-database-modes-"));
    const dataDirectory = join(root, "data");
    const databasePath = join(dataDirectory, "service.sqlite");
    let database: AppDatabase | null = null;
    try {
      mkdirSync(dataDirectory, { mode: 0o777 });
      chmodSync(dataDirectory, 0o777);
      process.umask(0o000);
      database = new AppDatabase(databasePath);
      database.connection.prepare("UPDATE poll_state SET updated_at = ? WHERE id = 1").run(new Date().toISOString());

      expect(process.umask()).toBe(0o077);
      expect(mode(dataDirectory)).toBe(0o700);
      expect(mode(databasePath)).toBe(0o600);
      expect(existsSync(`${databasePath}-wal`)).toBe(true);
      expect(existsSync(`${databasePath}-shm`)).toBe(true);
      expect(mode(`${databasePath}-wal`)).toBe(0o600);
      expect(mode(`${databasePath}-shm`)).toBe(0o600);
    } finally {
      database?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("migrates existing APNs registrations to provider-aware storage", () => {
    const root = mkdtempSync(join(tmpdir(), "beanstalk-provider-migration-"));
    const dataDirectory = join(root, "data");
    const databasePath = join(dataDirectory, "service.sqlite");
    let database: AppDatabase | null = null;
    try {
      mkdirSync(dataDirectory, { recursive: true });
      const legacy = new Database(databasePath);
      legacy.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations VALUES (1, '2026-09-13T00:00:00.000Z');
        INSERT INTO schema_migrations VALUES (2, '2026-09-13T00:00:00.000Z');
        CREATE TABLE devices (
          id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, device_token TEXT NOT NULL,
          environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), disabled_reason TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX active_device_token_idx
          ON devices(device_token, environment) WHERE active = 1;
        INSERT INTO devices VALUES (
          'legacy-device', '${"a".repeat(64)}', '${"b".repeat(64)}', 'production', 1, NULL,
          '2026-09-13T00:00:00.000Z', '2026-09-13T00:00:00.000Z'
        );
        CREATE TABLE delivery_queue (
          id INTEGER PRIMARY KEY, failure_kind TEXT
            CHECK (failure_kind IN ('apns', 'canceled', 'internal'))
        );
        INSERT INTO delivery_queue VALUES (1, 'apns');
      `);
      legacy.close();

      database = new AppDatabase(databasePath);
      expect(database.connection.prepare("SELECT provider, identifier_kind FROM devices").get()).toEqual({
        provider: "apns",
        identifier_kind: "token",
      });
      expect(database.connection.prepare("SELECT failure_provider FROM delivery_queue").get()).toEqual({
        failure_provider: "apns",
      });
      expect(database.connection.prepare("SELECT version FROM schema_migrations ORDER BY version").pluck().all()).toEqual([
        1,
        2,
        3,
      ]);
    } finally {
      database?.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("replaceEnrichment", () => {
  it("overwrites announcement text without touching eligibility, and refuses an unknown notice", () => {
    const database = new AppDatabase(":memory:");
    database.migrate();
    const original = storedNotice("relabel", "2026-09-17T00:00:00.000Z");
    original.codeInfo = "Brand | Product";
    database.upsertNotice({ ...original, eligibleForAlert: false });
    database.replaceEnrichment({
      ...original,
      summary: "Rewritten summary",
      codeInfo: "Brand: X · Product: Y",
      eligibleForAlert: true,
      foodClassification: "unknown",
      retrievedAt: "2026-09-19T20:00:00.000Z",
    });
    const stored = database.getStoredNotice(original.id);
    expect(stored?.summary).toBe("Rewritten summary");
    expect(stored?.codeInfo).toBe("Brand: X · Product: Y");
    expect(stored?.retrievedAt).toBe("2026-09-19T20:00:00.000Z");
    expect(stored?.eligibleForAlert).toBe(false);
    expect(stored?.foodClassification).toBe("food");
    expect(database.listNoticeIdsByKind("rss", 10)).toEqual([original.id]);
    expect(() => database.replaceEnrichment({ ...original, id: "missing" })).toThrow(/not stored/u);
    expect(() => database.listNoticeIdsByKind("rss", 0)).toThrow(/between 1 and 500/u);
    database.close();
  });
});
