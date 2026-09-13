import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database.js";

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
});
