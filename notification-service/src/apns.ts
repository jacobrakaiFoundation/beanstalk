import * as http2 from "node:http2";
import { importPKCS8, SignJWT } from "jose";
import type { ApnsEnvironment } from "./devices.js";

export interface PushMessage {
  deviceToken: string;
  environment: ApnsEnvironment;
  noticeId: string;
  title: string;
  body: string;
  matchedTerm: string;
  matchedField: string;
}

export type DeliveryResult =
  | { kind: "success" }
  | { kind: "transient" | "invalid" | "permanent"; code: string };

export interface PushSender {
  readonly configured: boolean;
  send(message: PushMessage): Promise<DeliveryResult>;
  close(): void;
}

interface ApnsCredentials {
  teamId: string;
  keyId: string;
  bundleId: string;
  privateKey: string;
}

interface ApnsResponse {
  status: number;
  reason: string;
}

const INVALID_REASONS = new Set([
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered",
]);
const PROVIDER_RETRY_REASONS = new Set(["ExpiredProviderToken", "InvalidProviderToken", "TooManyProviderTokenUpdates"]);
export const APNS_EXPIRATION_SECONDS = 60 * 60;

export function apnsExpirationHeader(nowMilliseconds = Date.now()): string {
  return String(Math.floor(nowMilliseconds / 1000) + APNS_EXPIRATION_SECONDS);
}

export class DisabledPushSender implements PushSender {
  readonly configured = false;

  async send(_message: PushMessage): Promise<DeliveryResult> {
    return { kind: "transient", code: "push_not_configured" };
  }

  close(): void {}
}

export class ApnsPushSender implements PushSender {
  readonly configured = true;
  private signingKey: CryptoKey | null = null;
  private providerToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly credentials: ApnsCredentials) {}

  async send(message: PushMessage): Promise<DeliveryResult> {
    try {
      const token = await this.getProviderToken();
      const host =
        message.environment === "production"
          ? "https://api.push.apple.com"
          : "https://api.sandbox.push.apple.com";
      const payload = JSON.stringify({
        aps: {
          alert: { title: message.title, body: message.body },
          sound: "default",
          "thread-id": "recall-notices",
        },
        noticeId: message.noticeId,
        matchedTerm: message.matchedTerm,
        matchedField: message.matchedField,
      });
      const response = await this.request(host, message.deviceToken, token, payload);
      if (response.status === 200) return { kind: "success" };
      if (response.status === 410 || INVALID_REASONS.has(response.reason)) {
        return { kind: "invalid", code: response.reason || `http_${response.status}` };
      }
      if (PROVIDER_RETRY_REASONS.has(response.reason)) {
        this.providerToken = null;
        return { kind: "transient", code: response.reason };
      }
      if (response.status === 429 || response.status >= 500) {
        return { kind: "transient", code: response.reason || `http_${response.status}` };
      }
      return { kind: "permanent", code: response.reason || `http_${response.status}` };
    } catch (error) {
      return {
        kind: "transient",
        code: error instanceof Error && error.name ? `transport_${error.name}` : "transport_error",
      };
    }
  }

  close(): void {}

  private async getProviderToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.providerToken && this.providerToken.expiresAt > now) return this.providerToken.value;
    this.signingKey ??= await importPKCS8(this.credentials.privateKey, "ES256");
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.credentials.keyId })
      .setIssuer(this.credentials.teamId)
      .setIssuedAt(now)
      .sign(this.signingKey);
    this.providerToken = { value, expiresAt: now + 50 * 60 };
    return value;
  }

  private request(host: string, deviceToken: string, providerToken: string, payload: string): Promise<ApnsResponse> {
    return new Promise((resolve, reject) => {
      const session = http2.connect(host);
      let settled = false;
      const finish = (error?: Error, response?: ApnsResponse): void => {
        if (settled) return;
        settled = true;
        session.close();
        if (error) reject(error);
        else if (response) resolve(response);
      };
      session.setTimeout(15_000, () => finish(new Error("APNs request timed out")));
      session.once("error", (error) => finish(error));
      const request = session.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken}`,
        "apns-topic": this.credentials.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": apnsExpirationHeader(),
        "content-type": "application/json",
      });
      let status = 0;
      let body = "";
      request.setEncoding("utf8");
      request.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      request.on("data", (chunk: string) => {
        if (body.length < 4096) body += chunk;
      });
      request.once("error", (error) => finish(error));
      request.once("end", () => {
        let reason = "";
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason ?? "";
        } catch {
          reason = "";
        }
        finish(undefined, { status, reason });
      });
      request.end(payload);
    });
  }
}

export function createPushSender(credentials: Partial<ApnsCredentials>): PushSender {
  if (!credentials.teamId || !credentials.keyId || !credentials.bundleId || !credentials.privateKey) {
    return new DisabledPushSender();
  }
  return new ApnsPushSender(credentials as ApnsCredentials);
}
