import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AppDatabase } from "./database.js";
import { validateAndNormalizeTerms } from "./domain.js";

export type ApnsEnvironment = "sandbox" | "production";

export interface DeviceRecord {
  id: string;
  deviceToken: string;
  environment: ApnsEnvironment;
  active: boolean;
  disabledReason: string | null;
  terms: string[];
}

interface DeviceRow {
  id: string;
  secret_hash: string;
  device_token: string;
  environment: ApnsEnvironment;
  active: number;
  disabled_reason: string | null;
}

function hashSecret(deviceId: string, secret: string): Buffer {
  return createHash("sha256").update(deviceId).update(".").update(secret).digest();
}

export function validateDeviceToken(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (!/^[a-f0-9]{64,200}$/u.test(normalized)) {
    throw new Error("deviceToken must be a 64 to 200 character hexadecimal APNs token");
  }
  return normalized;
}

export class DeviceStore {
  constructor(private readonly database: AppDatabase) {}

  create(deviceToken: string, environment: ApnsEnvironment, now: string): { deviceId: string; clientSecret: string } {
    const token = validateDeviceToken(deviceToken);
    const deviceId = randomUUID();
    const clientSecret = randomBytes(32).toString("base64url");
    const secretHash = hashSecret(deviceId, clientSecret).toString("hex");
    const create = this.database.connection.transaction(() => {
      const previous = this.database.connection
        .prepare("SELECT id FROM devices WHERE device_token = ? AND environment = ? AND active = 1")
        .all(token, environment) as { id: string }[];
      for (const row of previous) {
        this.database.connection
          .prepare("UPDATE devices SET active = 0, disabled_reason = 'replaced', updated_at = ? WHERE id = ?")
          .run(now, row.id);
        this.database.connection
          .prepare("UPDATE delivery_queue SET status = 'permanent_failure', last_error_code = 'device_replaced', failure_kind = 'canceled', updated_at = ? WHERE device_id = ? AND status IN ('queued', 'retry', 'sending')")
          .run(now, row.id);
      }
      this.database.connection
        .prepare(`INSERT INTO devices(id, secret_hash, device_token, environment, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?)`)
        .run(deviceId, secretHash, token, environment, now, now);
    });
    create();
    return { deviceId, clientSecret };
  }

  authenticate(bearer: string): DeviceRecord | null {
    const separator = bearer.indexOf(".");
    if (separator <= 0) return null;
    const id = bearer.slice(0, separator);
    const secret = bearer.slice(separator + 1);
    if (!secret) return null;
    const row = this.database.connection.prepare("SELECT * FROM devices WHERE id = ?").get(id) as DeviceRow | undefined;
    if (!row) return null;
    const expected = Buffer.from(row.secret_hash, "hex");
    const actual = hashSecret(row.id, secret);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return this.toRecord(row);
  }

  get(id: string): DeviceRecord | null {
    const row = this.database.connection.prepare("SELECT * FROM devices WHERE id = ?").get(id) as DeviceRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  updateToken(id: string, deviceToken: string, environment: ApnsEnvironment, now: string): void {
    const token = validateDeviceToken(deviceToken);
    const update = this.database.connection.transaction(() => {
      const previous = this.database.connection
        .prepare("SELECT id FROM devices WHERE device_token = ? AND environment = ? AND active = 1 AND id <> ?")
        .all(token, environment, id) as { id: string }[];
      for (const row of previous) {
        this.database.connection
          .prepare("UPDATE devices SET active = 0, disabled_reason = 'replaced', updated_at = ? WHERE id = ?")
          .run(now, row.id);
        this.database.connection
          .prepare("UPDATE delivery_queue SET status = 'permanent_failure', last_error_code = 'device_replaced', failure_kind = 'canceled', updated_at = ? WHERE device_id = ? AND status IN ('queued', 'retry', 'sending')")
          .run(now, row.id);
      }
      const result = this.database.connection
        .prepare("UPDATE devices SET device_token = ?, environment = ?, active = 1, disabled_reason = NULL, updated_at = ? WHERE id = ?")
        .run(token, environment, now, id);
      if (result.changes !== 1) throw new Error("Device not found");
    });
    update();
  }

  setWatchlist(id: string, rawTerms: readonly string[], now: string): string[] {
    const terms = validateAndNormalizeTerms(rawTerms);
    const update = this.database.connection.transaction(() => {
      this.database.connection.prepare("DELETE FROM watch_terms WHERE device_id = ?").run(id);
      const insert = this.database.connection.prepare(
        "INSERT INTO watch_terms(device_id, term, created_at) VALUES (?, ?, ?)",
      );
      for (const term of terms) insert.run(id, term, now);
      this.database.connection
        .prepare(`
          UPDATE delivery_queue
          SET status = 'permanent_failure', last_error_code = 'watchlist_changed', failure_kind = 'canceled', updated_at = ?
          WHERE device_id = ? AND status IN ('queued', 'retry')
            AND matched_term NOT IN (SELECT term FROM watch_terms WHERE device_id = ?)
        `)
        .run(now, id, id);
      this.database.connection.prepare("UPDATE devices SET updated_at = ? WHERE id = ?").run(now, id);
    });
    update();
    return terms;
  }

  delete(id: string): boolean {
    return this.database.connection.prepare("DELETE FROM devices WHERE id = ?").run(id).changes === 1;
  }

  disable(id: string, reason: string, now: string): void {
    this.database.connection
      .prepare("UPDATE devices SET active = 0, disabled_reason = ?, updated_at = ? WHERE id = ?")
      .run(reason, now, id);
  }

  pruneInactive(before: string): number {
    return this.database.connection
      .prepare("DELETE FROM devices WHERE active = 0 AND updated_at < ?")
      .run(before).changes;
  }

  private toRecord(row: DeviceRow): DeviceRecord {
    const terms = this.database.connection
      .prepare("SELECT term FROM watch_terms WHERE device_id = ? ORDER BY term")
      .all(row.id)
      .map((item) => (item as { term: string }).term);
    return {
      id: row.id,
      deviceToken: row.device_token,
      environment: row.environment,
      active: row.active === 1,
      disabledReason: row.disabled_reason,
      terms,
    };
  }
}
