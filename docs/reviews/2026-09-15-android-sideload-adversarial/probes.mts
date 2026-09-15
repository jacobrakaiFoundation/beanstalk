import { writeFileSync } from "node:fs";
import { buildApp } from "../../../notification-service/src/app.ts";
import { AppDatabase } from "../../../notification-service/src/database.ts";
import { DeviceStore, validatePushIdentifier } from "../../../notification-service/src/devices.ts";
import { NotificationQueue } from "../../../notification-service/src/queue.ts";
import { FakeSender } from "../../../notification-service/test/helpers.ts";

const output: Record<string, unknown> = {};

const fcmRegistrationToken =
  "dXyZ0AbCdEfGhIjKlMnOp:APA91bContractProbeOnly-ThisIsARegistrationTokenNotAFid";
const firebaseInstallationId = "cAbCdEfGhIjKlMnOpQrStU";

function classify(identifierKind: "fid" | "token", value: string) {
  try {
    return { ok: true, normalized: validatePushIdentifier("fcm", identifierKind, value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

output.identifierContract = {
  fcmTokenAsFid: classify("fid", fcmRegistrationToken),
  fcmTokenAsToken: classify("token", fcmRegistrationToken),
  fidAsFid: classify("fid", firebaseInstallationId),
  fidAsToken: classify("token", firebaseInstallationId),
};

{
  const database = new AppDatabase(":memory:");
  const devices = new DeviceStore(database);
  const sender = new FakeSender([], false);
  const queue = new NotificationQueue(database, devices, sender);
  const app = await buildApp({
    database,
    devices,
    queue,
    sender,
    now: () => new Date("2026-09-15T16:00:00.000Z"),
  });

  const rejectedFidRegistration = await app.inject({
    method: "POST",
    url: "/v1/devices",
    payload: { provider: "fcm", pushIdentifier: fcmRegistrationToken, identifierKind: "fid" },
  });
  output.rejectedTokenLabeledFid = {
    status: rejectedFidRegistration.statusCode,
    body: rejectedFidRegistration.json(),
  };

  const acceptedTokenRegistration = await app.inject({
    method: "POST",
    url: "/v1/devices",
    payload: { provider: "fcm", pushIdentifier: fcmRegistrationToken, identifierKind: "token" },
  });
  output.acceptedTokenLabeledToken = {
    status: acceptedTokenRegistration.statusCode,
    keys: Object.keys(acceptedTokenRegistration.json() as object),
  };

  const credentials = acceptedTokenRegistration.json<{ deviceId: string; clientSecret: string }>();
  const authorization = `Bearer ${credentials.deviceId}.${credentials.clientSecret}`;

  const rotateWrongPath = await app.inject({
    method: "PUT",
    url: "/v1/devices/me",
    headers: { authorization },
    payload: { provider: "fcm", pushIdentifier: fcmRegistrationToken, identifierKind: "token" },
  });
  output.rotatePutDevicesMe = {
    status: rotateWrongPath.statusCode,
    error: (rotateWrongPath.json() as { error?: string }).error ?? rotateWrongPath.json(),
  };

  const rotateCorrectPath = await app.inject({
    method: "PUT",
    url: "/v1/devices/me/token",
    headers: { authorization },
    payload: { provider: "fcm", pushIdentifier: `${fcmRegistrationToken}-rotated`, identifierKind: "token" },
  });
  output.rotatePutDevicesMeToken = {
    status: rotateCorrectPath.statusCode,
    keys: Object.keys(rotateCorrectPath.json() as object),
    hasDeviceId: "deviceId" in (rotateCorrectPath.json() as object),
    hasClientSecret: "clientSecret" in (rotateCorrectPath.json() as object),
  };

  const longQuery = await app.inject({
    method: "GET",
    url: `/v1/notices?query=${"x".repeat(121)}`,
  });
  output.noticeQuery121 = {
    status: longQuery.statusCode,
    message: (longQuery.json() as { message?: string }).message,
  };

  const quotedQuery = await app.inject({
    method: "GET",
    url: "/v1/notices?query=peanut%22butter",
  });
  output.noticeQuotedQuery = { status: quotedQuery.statusCode };

  await app.close();
  database.close();
}

writeFileSync(new URL("./probe-results.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
