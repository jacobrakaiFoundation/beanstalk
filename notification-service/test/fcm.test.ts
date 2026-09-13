import { describe, expect, it, vi } from "vitest";
import { FcmPushSender } from "../src/fcm.js";
import type { PushMessage } from "../src/push.js";

const message: PushMessage = {
  provider: "fcm",
  pushIdentifier: "cAbCdEfGhIjKlMnOpQrStU",
  identifierKind: "fid",
  environment: null,
  noticeId: "notice_0123456789abcdef0123456789abcdef",
  title: "Food recall",
  body: "Potential Salmonella contamination",
  matchedTerm: "salmonella",
  matchedField: "reasonForRecall",
};

function sender(response: Response, fetchSpy = vi.fn(async () => response)) {
  return {
    sender: new FcmPushSender(
      {
        projectId: "beanstalk-prod",
        serviceAccountPath: "/unused/service-account.json",
        androidPackageName: "org.jacobrakaifoundation.beanstalk",
      },
      {
        getAccessToken: async () => "short-lived-access-token",
        fetch: fetchSpy as typeof fetch,
        now: () => Date.parse("2026-09-13T20:00:00.000Z"),
      },
    ),
    fetchSpy,
  };
}

describe("FCM HTTP v1 sender", () => {
  it("targets the recommended FID field with bounded Android notification data", async () => {
    const fixture = sender(new Response(JSON.stringify({ name: "projects/beanstalk-prod/messages/1" }), { status: 200 }));

    await expect(fixture.sender.send(message)).resolves.toEqual({ kind: "success" });
    expect(fixture.fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fixture.fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/beanstalk-prod/messages:send");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer short-lived-access-token");
    const payload = JSON.parse(init.body as string) as {
      message: Record<string, unknown> & { data: Record<string, string>; android: Record<string, unknown> };
    };
    expect(payload.message.fid).toBe(message.pushIdentifier);
    expect(payload.message).not.toHaveProperty("token");
    expect(payload.message.data).toEqual({ noticeId: message.noticeId });
    expect(payload.message.notification).toEqual({
      title: "Beanstalk recall alert",
      body: "A new FDA recall matches your watchlist. Tap to review the official notice.",
    });
    expect(JSON.stringify(payload)).not.toContain("salmonella");
    expect(JSON.stringify(payload)).not.toContain("reasonForRecall");
    expect(payload.message.android).toMatchObject({
      priority: "HIGH",
      ttl: "3600s",
      restricted_package_name: "org.jacobrakaifoundation.beanstalk",
      notification: { channel_id: "recall_matches" },
    });
  });

  it("co-supports deprecated FCM tokens during the Firebase transition", async () => {
    const fixture = sender(new Response("{}", { status: 200 }));
    await fixture.sender.send({ ...message, identifierKind: "token", pushIdentifier: "legacy:fcm-token-value-123456" });
    const [, init] = fixture.fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(init.body as string) as { message: Record<string, unknown> };
    expect(payload.message.token).toBe("legacy:fcm-token-value-123456");
    expect(payload.message).not.toHaveProperty("fid");
  });

  it("classifies an unregistered installation as invalid", async () => {
    const fixture = sender(
      new Response(
        JSON.stringify({
          error: {
            code: 404,
            status: "NOT_FOUND",
            details: [
              {
                "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                errorCode: "UNREGISTERED",
              },
            ],
          },
        }),
        { status: 404 },
      ),
    );
    await expect(fixture.sender.send(message)).resolves.toEqual({ kind: "invalid", code: "UNREGISTERED" });
  });

  it("honors FCM Retry-After and the one-minute minimum for quota errors", async () => {
    const fixture = sender(
      new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }), {
        status: 429,
        headers: { "retry-after": "120" },
      }),
    );
    await expect(fixture.sender.send(message)).resolves.toEqual({
      kind: "transient",
      code: "RESOURCE_EXHAUSTED",
      retryAfterSeconds: 120,
    });
  });

  it("does not disable an installation for a generic request-shape error", async () => {
    const fixture = sender(
      new Response(JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT" } }), { status: 400 }),
    );
    await expect(fixture.sender.send(message)).resolves.toEqual({ kind: "permanent", code: "INVALID_ARGUMENT" });
  });
});
