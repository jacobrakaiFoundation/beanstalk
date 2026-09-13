import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database.js";
import { DeviceStore } from "../src/devices.js";
import { NotificationQueue } from "../src/queue.js";
import { FakeSender, storedNotice } from "./helpers.js";

const quarantineSql = readFileSync(
  fileURLToPath(new URL("../scripts/quarantine-restored.sql", import.meta.url)),
  "utf8",
);
const backupScript = fileURLToPath(new URL("../scripts/backup.sh", import.meta.url));
const restoreScript = fileURLToPath(new URL("../scripts/restore.sh", import.meta.url));
const sqliteAvailable = spawnSync("sqlite3", ["-version"], { stdio: "ignore" }).status === 0;

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

function runWithPermissiveUmask(script: string, arguments_: string[], environment: NodeJS.ProcessEnv) {
  return spawnSync("bash", ["-c", 'umask 000; exec bash "$@"', "beanstalk-script", script, ...arguments_], {
    encoding: "utf8",
    env: environment,
  });
}

describe("restore quarantine", () => {
  it("cannot reactivate a deleted device or replay backup deliveries without an explicit token refresh", async () => {
    const directory = mkdtempSync(join(tmpdir(), "beanstalk-restore-"));
    const backupPath = join(directory, "backup.sqlite");
    const livePath = join(directory, "live.sqlite");
    let database: AppDatabase | null = null;
    try {
      database = new AppDatabase(backupPath);
      const backupDevices = new DeviceStore(database);
      const backupQueue = new NotificationQueue(database, backupDevices, new FakeSender());
      const beforeBackup = "2026-09-01T20:00:00.000Z";
      const credentials = backupDevices.create("a".repeat(64), "sandbox", beforeBackup);
      backupDevices.setWatchlist(credentials.deviceId, ["salmonella"], beforeBackup);
      for (const slug of ["restore-queued", "restore-retry", "restore-sending"]) {
        const notice = storedNotice(slug, beforeBackup, "Salmonella recall");
        database.upsertNotice(notice);
        backupQueue.enqueueNotice(notice.id, beforeBackup);
      }
      database.connection
        .prepare("UPDATE delivery_queue SET status = 'retry' WHERE id = (SELECT id FROM delivery_queue ORDER BY id LIMIT 1 OFFSET 1)")
        .run();
      database.connection
        .prepare("UPDATE delivery_queue SET status = 'sending' WHERE id = (SELECT id FROM delivery_queue ORDER BY id LIMIT 1 OFFSET 2)")
        .run();
      database.close();
      database = null;

      copyFileSync(backupPath, livePath);
      database = new AppDatabase(livePath);
      expect(new DeviceStore(database).delete(credentials.deviceId)).toBe(true);
      database.close();
      database = null;

      copyFileSync(backupPath, livePath);
      database = new AppDatabase(livePath);
      database.connection.exec(quarantineSql);
      const restoredDevices = new DeviceStore(database);
      const restoredQueue = new NotificationQueue(database, restoredDevices, new FakeSender());
      const bearer = `${credentials.deviceId}.${credentials.clientSecret}`;
      expect(restoredDevices.authenticate(bearer)).toMatchObject({
        id: credentials.deviceId,
        active: false,
        disabledReason: "restored_quarantine",
        terms: ["salmonella"],
      });
      const canceled = database.connection
        .prepare("SELECT status, last_error_code, failure_kind FROM delivery_queue ORDER BY id")
        .all();
      expect(canceled).toEqual([
        { status: "permanent_failure", last_error_code: "restore_quarantine", failure_kind: "canceled" },
        { status: "permanent_failure", last_error_code: "restore_quarantine", failure_kind: "canceled" },
        { status: "permanent_failure", last_error_code: "restore_quarantine", failure_kind: "canceled" },
      ]);
      expect(await restoredQueue.processDue("2026-09-13T20:00:00.000Z")).toBe(0);

      restoredDevices.updateToken(credentials.deviceId, "b".repeat(64), "production", "2026-09-13T20:01:00.000Z");
      expect(restoredDevices.get(credentials.deviceId)).toMatchObject({
        active: true,
        disabledReason: null,
        environment: "production",
      });
      expect(restoredQueue.health("2026-09-13T20:01:00.000Z")).toMatchObject({
        queued: 0,
        retrying: 0,
        sending: 0,
        failed: 3,
      });
    } finally {
      database?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  (sqliteAvailable ? it : it.skip)("executes backup and restore without WAL, SHM, or candidate artifacts", () => {
    const directory = mkdtempSync(join(tmpdir(), "beanstalk-restore-script-"));
    const livePath = join(directory, "live.sqlite");
    const backupDirectory = join(directory, "backups");
    let database: AppDatabase | null = null;
    try {
      database = new AppDatabase(livePath);
      const devices = new DeviceStore(database);
      const queue = new NotificationQueue(database, devices, new FakeSender());
      const beforeBackup = "2026-09-01T20:00:00.000Z";
      const credentials = devices.create("a".repeat(64), "sandbox", beforeBackup);
      devices.setWatchlist(credentials.deviceId, ["salmonella"], beforeBackup);
      const notice = storedNotice("script-restore", beforeBackup, "Salmonella recall");
      database.upsertNotice(notice);
      queue.enqueueNotice(notice.id, beforeBackup);
      database.close();
      database = null;

      mkdirSync(backupDirectory, { recursive: true });
      chmodSync(directory, 0o777);
      chmodSync(backupDirectory, 0o777);
      chmodSync(livePath, 0o666);
      const prunedBackup = join(backupDirectory, "beanstalk-notifications-prune.sqlite");
      const retainedBackup = join(backupDirectory, "beanstalk-notifications-retain.sqlite");
      const prunedSnapshot = `${livePath}.before-restore-prune`;
      const retainedSnapshot = `${livePath}.before-restore-retain`;
      writeFileSync(prunedBackup, "expired");
      writeFileSync(retainedBackup, "retained");
      writeFileSync(prunedSnapshot, "expired snapshot");
      writeFileSync(retainedSnapshot, "retained snapshot");
      const now = Date.now();
      const hour = 60 * 60 * 1_000;
      utimesSync(prunedBackup, new Date(now - 13 * 24 * hour - 2 * hour), new Date(now - 13 * 24 * hour - 2 * hour));
      utimesSync(retainedBackup, new Date(now - 12 * 24 * hour), new Date(now - 12 * 24 * hour));
      utimesSync(prunedSnapshot, new Date(now - 13 * 24 * hour - 2 * hour), new Date(now - 13 * 24 * hour - 2 * hour));
      utimesSync(retainedSnapshot, new Date(now - 12 * 24 * hour), new Date(now - 12 * 24 * hour));

      const backup = runWithPermissiveUmask(
        backupScript,
        [],
        {
          ...process.env,
          DATABASE_PATH: livePath,
          BACKUP_DIRECTORY: backupDirectory,
          BACKUP_RETENTION_DAYS: "14",
        },
      );
      expect(backup.status, backup.stderr).toBe(0);
      const backupPath = backup.stdout.trim().split("\n").at(-1) as string;
      expect(existsSync(backupPath)).toBe(true);
      expect(existsSync(`${backupPath}-wal`)).toBe(false);
      expect(existsSync(`${backupPath}-shm`)).toBe(false);
      expect(existsSync(prunedBackup)).toBe(false);
      expect(existsSync(retainedBackup)).toBe(true);
      expect(existsSync(prunedSnapshot)).toBe(false);
      expect(existsSync(retainedSnapshot)).toBe(true);
      expect(mode(directory)).toBe(0o700);
      expect(mode(backupDirectory)).toBe(0o700);
      expect(mode(livePath)).toBe(0o600);
      expect(mode(backupPath)).toBe(0o600);
      expect(spawnSync("sqlite3", [backupPath, "PRAGMA journal_mode;"], { encoding: "utf8" }).stdout.trim()).toBe(
        "delete",
      );

      database = new AppDatabase(livePath);
      expect(new DeviceStore(database).delete(credentials.deviceId)).toBe(true);
      database.close();
      database = null;

      const restorePrunedSnapshot = `${livePath}.before-restore-old`;
      writeFileSync(restorePrunedSnapshot, "expired restore snapshot");
      utimesSync(
        restorePrunedSnapshot,
        new Date(now - 13 * 24 * hour - 2 * hour),
        new Date(now - 13 * 24 * hour - 2 * hour),
      );
      chmodSync(directory, 0o777);
      chmodSync(livePath, 0o666);

      const restore = runWithPermissiveUmask(
        restoreScript,
        ["--confirm", backupPath],
        { ...process.env, DATABASE_PATH: livePath, BACKUP_RETENTION_DAYS: "14" },
      );
      expect(restore.status, restore.stderr).toBe(0);
      expect(readdirSync(directory).filter((name) => name.startsWith(".restore-candidate."))).toEqual([]);
      expect(existsSync(`${livePath}-wal`)).toBe(false);
      expect(existsSync(`${livePath}-shm`)).toBe(false);
      expect(existsSync(restorePrunedSnapshot)).toBe(false);
      expect(existsSync(retainedSnapshot)).toBe(true);
      const currentSnapshots = readdirSync(directory).filter((name) => name.startsWith("live.sqlite.before-restore-"));
      expect(currentSnapshots).toHaveLength(2);
      expect(mode(directory)).toBe(0o700);
      expect(mode(livePath)).toBe(0o600);
      for (const snapshot of currentSnapshots) expect(mode(join(directory, snapshot))).toBe(0o600);
      expect(spawnSync("sqlite3", [livePath, "PRAGMA journal_mode;"], { encoding: "utf8" }).stdout.trim()).toBe(
        "delete",
      );

      database = new AppDatabase(livePath);
      expect(new DeviceStore(database).get(credentials.deviceId)).toMatchObject({
        active: false,
        disabledReason: "restored_quarantine",
      });
      expect(
        database.connection.prepare("SELECT status, last_error_code FROM delivery_queue").get(),
      ).toEqual({ status: "permanent_failure", last_error_code: "restore_quarantine" });

      const invalidRetention = runWithPermissiveUmask(
        backupScript,
        [],
        {
          ...process.env,
          DATABASE_PATH: livePath,
          BACKUP_DIRECTORY: backupDirectory,
          BACKUP_RETENTION_DAYS: "0",
        },
      );
      expect(invalidRetention.status).toBe(2);
      expect(invalidRetention.stderr).toContain("positive integer");
    } finally {
      database?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
