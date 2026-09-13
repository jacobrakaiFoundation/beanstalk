import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AppDatabase } from "./database.js";
import { validateAndNormalizeTerms } from "./domain.js";

export type ApnsEnvironment = "sandbox" | "production";
export type PushProvider = "apns" | "fcm";
export type PushIdentifierKind = "token" | "fid";

export type DeviceRegistration =
  | {
      provider: "apns";
      pushIdentifier: string;
      identifierKind?: "token";
      environment: ApnsEnvironment;
    }
  | {
      provider: "fcm";
      pushIdentifier: string;
      identifierKind: PushIdentifierKind;
    };

interface NormalizedRegistration {
  provider: PushProvider;
  pushIdentifier: string;
  identifierKind: PushIdentifierKind;
  environment: ApnsEnvironment;
}

export interface DeviceRecord {
  id: string;
  pushIdentifier: string;
  provider: PushProvider;
  identifierKind: PushIdentifierKind;
  environment: ApnsEnvironment | null;
  active: boolean;
  disabledReason: string | null;
  terms: string[];
}

interface DeviceRow {
  id: string;
  secret_hash: string;
  device_token: string;
  environment: ApnsEnvironment;
  provider: PushProvider;
  identifier_kind: PushIdentifierKind;
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

export function validatePushIdentifier(
  provider: PushProvider,
  identifierKind: PushIdentifierKind,
  value: string,
): string {
  if (provider === "apns") {
    if (identifierKind !== "token") throw new Error("identifierKind must be token for APNs");
    return validateDeviceToken(value);
  }
  const normalized = value.trim();
  const hasInvalidTokenCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /\s/u.test(character) || codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (identifierKind === "fid") {
    // FIDs are URL-safe base64 identifiers. The bounded range permits future
    // Firebase format changes while rejecting whitespace and control characters.
    if (!/^[A-Za-z0-9_-]{10,200}$/u.test(normalized)) {
      throw new Error("pushIdentifier must be a 10 to 200 character URL-safe Firebase Installation ID");
    }
  } else if (normalized.length < 20 || normalized.length > 4096 || hasInvalidTokenCharacter) {
    throw new Error("pushIdentifier must be a valid 20 to 4096 character FCM registration token");
  }
  return normalized;
}

function normalizeRegistration(registration: DeviceRegistration): NormalizedRegistration {
  const identifierKind = registration.provider === "apns" ? "token" : registration.identifierKind;
  return {
    provider: registration.provider,
    identifierKind,
    pushIdentifier: validatePushIdentifier(registration.provider, identifierKind, registration.pushIdentifier),
    environment: registration.provider === "apns" ? registration.environment : "production",
  };
}

export class DeviceStore {
  constructor(private readonly database: AppDatabase) {}

  create(deviceToken: string, environment: ApnsEnvironment, now: string): { deviceId: string; clientSecret: string };
  create(registration: DeviceRegistration, now: string): { deviceId: string; clientSecret: string };
  create(
    registrationOrToken: DeviceRegistration | string,
    environmentOrNow: ApnsEnvironment | string,
    legacyNow?: string,
  ): { deviceId: string; clientSecret: string } {
    const registration = normalizeRegistration(
      typeof registrationOrToken === "string"
        ? {
            provider: "apns",
            pushIdentifier: registrationOrToken,
            environment: environmentOrNow as ApnsEnvironment,
          }
        : registrationOrToken,
    );
    const now = typeof registrationOrToken === "string" ? (legacyNow as string) : environmentOrNow;
    const deviceId = randomUUID();
    const clientSecret = randomBytes(32).toString("base64url");
    const secretHash = hashSecret(deviceId, clientSecret).toString("hex");
    const create = this.database.connection.transaction(() => {
      const previous = this.database.connection
        .prepare(
          "SELECT id FROM devices WHERE provider = ? AND device_token = ? AND environment = ? AND active = 1",
        )
        .all(registration.provider, registration.pushIdentifier, registration.environment) as { id: string }[];
      for (const row of previous) {
        this.database.connection
          .prepare("UPDATE devices SET active = 0, disabled_reason = 'replaced', updated_at = ? WHERE id = ?")
          .run(now, row.id);
        this.database.connection
          .prepare("UPDATE delivery_queue SET status = 'permanent_failure', last_error_code = 'device_replaced', failure_kind = 'canceled', updated_at = ? WHERE device_id = ? AND status IN ('queued', 'retry', 'sending')")
          .run(now, row.id);
      }
      this.database.connection
        .prepare(`INSERT INTO devices(
                    id, secret_hash, device_token, environment, provider, identifier_kind, created_at, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          deviceId,
          secretHash,
          registration.pushIdentifier,
          registration.environment,
          registration.provider,
          registration.identifierKind,
          now,
          now,
        );
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
    if (row.active !== 1 && row.disabled_reason !== "restored_quarantine") return null;
    return this.toRecord(row);
  }

  get(id: string): DeviceRecord | null {
    const row = this.database.connection.prepare("SELECT * FROM devices WHERE id = ?").get(id) as DeviceRow | undefined;
    return row ? this.toRecord(row) : null;
  }

  updateToken(id: string, deviceToken: string, environment: ApnsEnvironment, now: string): void;
  updateToken(id: string, registration: DeviceRegistration, now: string): void;
  updateToken(
    id: string,
    registrationOrToken: DeviceRegistration | string,
    environmentOrNow: ApnsEnvironment | string,
    legacyNow?: string,
  ): void {
    const registration = normalizeRegistration(
      typeof registrationOrToken === "string"
        ? {
            provider: "apns",
            pushIdentifier: registrationOrToken,
            environment: environmentOrNow as ApnsEnvironment,
          }
        : registrationOrToken,
    );
    const now = typeof registrationOrToken === "string" ? (legacyNow as string) : environmentOrNow;
    const update = this.database.connection.transaction(() => {
      const current = this.database.connection
        .prepare("SELECT active, disabled_reason, provider FROM devices WHERE id = ?")
        .get(id) as { active: number; disabled_reason: string | null; provider: PushProvider } | undefined;
      if (!current) throw new Error("Device not found");
      if (current.provider !== registration.provider) {
        throw new Error("provider cannot change for existing device credentials");
      }
      if (current.active !== 1 && current.disabled_reason !== "restored_quarantine") {
        throw new Error("pushIdentifier update is not permitted for superseded or disabled credentials");
      }
      const owner = this.database.connection
        .prepare(
          "SELECT id FROM devices WHERE provider = ? AND device_token = ? AND environment = ? AND active = 1 AND id <> ?",
        )
        .get(registration.provider, registration.pushIdentifier, registration.environment, id) as
        | { id: string }
        | undefined;
      if (owner) throw new Error("pushIdentifier is already registered to another active device");
      const result = this.database.connection
        .prepare(
          "UPDATE devices SET device_token = ?, environment = ?, identifier_kind = ?, active = 1, disabled_reason = NULL, updated_at = ? WHERE id = ?",
        )
        .run(registration.pushIdentifier, registration.environment, registration.identifierKind, now, id);
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
      pushIdentifier: row.device_token,
      provider: row.provider,
      identifierKind: row.identifier_kind,
      environment: row.provider === "apns" ? row.environment : null,
      active: row.active === 1,
      disabledReason: row.disabled_reason,
      terms,
    };
  }
}
