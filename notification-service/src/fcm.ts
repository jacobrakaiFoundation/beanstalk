import { GoogleAuth } from "google-auth-library";
import type { DeliveryResult, ProviderPushSender, PushMessage } from "./push.js";

export interface FcmCredentials {
  projectId: string;
  serviceAccountPath: string;
  androidPackageName: string;
}

interface FcmDependencies {
  fetch?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  now?: () => number;
}

interface ParsedFcmError {
  code: string;
  hasFcmDetail: boolean;
}

const TRANSIENT_CODES = new Set([
  "INTERNAL",
  "UNAVAILABLE",
  "QUOTA_EXCEEDED",
  "RESOURCE_EXHAUSTED",
  "UNAUTHENTICATED",
]);
const INVALID_CODES = new Set(["UNREGISTERED", "INSTALLATION_ID_NOT_REGISTERED"]);
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const ANDROID_NOTIFICATION_TITLE = "Beanstalk recall alert";
const ANDROID_NOTIFICATION_BODY = "A new FDA recall matches your watchlist. Tap to review the official notice.";

function parseError(body: string, status: number): ParsedFcmError {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        status?: unknown;
        details?: unknown;
      };
    };
    const details = Array.isArray(parsed.error?.details) ? parsed.error.details : [];
    for (const detail of details) {
      if (
        detail &&
        typeof detail === "object" &&
        "@type" in detail &&
        typeof detail["@type"] === "string" &&
        detail["@type"].endsWith("google.firebase.fcm.v1.FcmError") &&
        "errorCode" in detail &&
        typeof detail.errorCode === "string"
      ) {
        return { code: detail.errorCode, hasFcmDetail: true };
      }
    }
    if (typeof parsed.error?.status === "string") {
      return { code: parsed.error.status, hasFcmDetail: false };
    }
  } catch {
    // The bounded HTTP status remains useful when FCM returns a non-JSON proxy error.
  }
  return { code: `http_${status}`, hasFcmDetail: false };
}

function retryAfterSeconds(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

export class DisabledFcmPushSender implements ProviderPushSender {
  readonly provider = "fcm" as const;
  readonly configured = false;

  async send(_message: PushMessage): Promise<DeliveryResult> {
    return { kind: "transient", code: "fcm_not_configured" };
  }

  close(): void {}
}

export class FcmPushSender implements ProviderPushSender {
  readonly provider = "fcm" as const;
  readonly configured = true;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessTokenImpl: () => Promise<string>;
  private readonly now: () => number;

  constructor(
    private readonly credentials: FcmCredentials,
    dependencies: FcmDependencies = {},
  ) {
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? Date.now;
    if (dependencies.getAccessToken) {
      this.getAccessTokenImpl = dependencies.getAccessToken;
    } else {
      const auth = new GoogleAuth({ keyFile: credentials.serviceAccountPath, scopes: [FCM_SCOPE] });
      this.getAccessTokenImpl = async () => {
        const accessToken = await auth.getAccessToken();
        if (!accessToken) throw new Error("FCM access token was empty");
        return accessToken;
      };
    }
  }

  async send(message: PushMessage): Promise<DeliveryResult> {
    if (message.provider !== "fcm") return { kind: "permanent", code: "fcm_registration_invalid" };
    try {
      const accessToken = await this.getAccessTokenImpl();
      const target =
        message.identifierKind === "fid"
          ? { fid: message.pushIdentifier }
          : { token: message.pushIdentifier };
      const response = await this.fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.credentials.projectId)}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            message: {
              ...target,
              notification: { title: ANDROID_NOTIFICATION_TITLE, body: ANDROID_NOTIFICATION_BODY },
              data: { noticeId: message.noticeId },
              android: {
                priority: "HIGH",
                ttl: "3600s",
                collapse_key: `recall-${message.noticeId}`,
                restricted_package_name: this.credentials.androidPackageName,
                notification: {
                  channel_id: "recall_matches",
                  tag: `recall-${message.noticeId}`,
                  sound: "default",
                },
              },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.ok) return { kind: "success" };
      const parsed = parseError(await response.text(), response.status);
      if (INVALID_CODES.has(parsed.code) || (parsed.hasFcmDetail && parsed.code === "INVALID_ARGUMENT")) {
        return { kind: "invalid", code: parsed.code };
      }
      if (response.status === 429 || response.status >= 500 || TRANSIENT_CODES.has(parsed.code)) {
        const headerDelay = retryAfterSeconds(response.headers.get("retry-after"), this.now());
        const minimumDelay = response.status === 429 ? 60 : 0;
        const delay = Math.max(headerDelay ?? 0, minimumDelay);
        return {
          kind: "transient",
          code: parsed.code,
          ...(delay > 0 ? { retryAfterSeconds: delay } : {}),
        };
      }
      return { kind: "permanent", code: parsed.code };
    } catch (error) {
      return {
        kind: "transient",
        code: error instanceof Error && error.name ? `transport_${error.name}` : "transport_error",
      };
    }
  }

  close(): void {}
}

export function createFcmPushSender(credentials: Partial<FcmCredentials>): ProviderPushSender {
  if (!credentials.projectId || !credentials.serviceAccountPath || !credentials.androidPackageName) {
    return new DisabledFcmPushSender();
  }
  return new FcmPushSender(credentials as FcmCredentials);
}
