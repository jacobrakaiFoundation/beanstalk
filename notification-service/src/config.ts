import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_ANNUAL_XML_URL, DEFAULT_RSS_URL } from "./sources.js";

const MAX_ANNUAL_XML_URLS = 2;

export interface ServiceConfig {
  host: string;
  port: number;
  databasePath: string;
  rssUrl: string;
  annualXmlUrls: string[];
  pollIntervalMs: number;
  queueIntervalMs: number;
  retentionDays: number;
  trustProxy: boolean;
  pollStaleAfterMs: number;
  announcementConcurrency: number;
  apns: {
    teamId?: string;
    keyId?: string;
    bundleId?: string;
    privateKey?: string;
  };
  fcm: {
    projectId?: string;
    serviceAccountPath?: string;
    androidPackageName?: string;
  };
}

function integer(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
}

function privateKey(): string | undefined {
  if (process.env.APNS_PRIVATE_KEY) return process.env.APNS_PRIVATE_KEY.replace(/\\n/gu, "\n");
  if (process.env.APNS_PRIVATE_KEY_PATH) return readFileSync(process.env.APNS_PRIVATE_KEY_PATH, "utf8");
  return undefined;
}

function androidPackageName(): string | undefined {
  const value = process.env.FCM_ANDROID_PACKAGE_NAME;
  if (!value) return undefined;
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u.test(value)) {
    throw new Error("FCM_ANDROID_PACKAGE_NAME must be a valid Android application ID");
  }
  return value;
}

export function loadConfig(): ServiceConfig {
  const key = privateKey();
  const apns = {
    ...(process.env.APNS_TEAM_ID ? { teamId: process.env.APNS_TEAM_ID } : {}),
    ...(process.env.APNS_KEY_ID ? { keyId: process.env.APNS_KEY_ID } : {}),
    ...(process.env.APNS_BUNDLE_ID ? { bundleId: process.env.APNS_BUNDLE_ID } : {}),
    ...(key ? { privateKey: key } : {}),
  };
  const serviceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const packageName = androidPackageName();
  const fcm = {
    ...(process.env.FCM_PROJECT_ID ? { projectId: process.env.FCM_PROJECT_ID } : {}),
    ...(serviceAccountPath ? { serviceAccountPath: resolve(serviceAccountPath) } : {}),
    ...(packageName ? { androidPackageName: packageName } : {}),
  };
  const annualXmlUrls = (process.env.FDA_ANNUAL_XML_URLS ?? process.env.FDA_ANNUAL_XML_URL ?? DEFAULT_ANNUAL_XML_URL)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (annualXmlUrls.length === 0) throw new Error("FDA_ANNUAL_XML_URLS must include at least one official XML URL");
  if (annualXmlUrls.length > MAX_ANNUAL_XML_URLS) {
    throw new Error(`FDA_ANNUAL_XML_URLS must include at most ${MAX_ANNUAL_XML_URLS} official XML URLs`);
  }
  const announcementConcurrency = integer("ANNOUNCEMENT_FETCH_CONCURRENCY", 4, 1);
  if (announcementConcurrency > 8) throw new Error("ANNOUNCEMENT_FETCH_CONCURRENCY must be <= 8");
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: integer("PORT", 8787, 1),
    databasePath: resolve(process.env.DATABASE_PATH ?? "./data/beanstalk-notifications.sqlite"),
    rssUrl: process.env.FDA_RSS_URL ?? DEFAULT_RSS_URL,
    annualXmlUrls,
    pollIntervalMs: integer("POLL_INTERVAL_MS", 15 * 60 * 1000, 60_000),
    queueIntervalMs: integer("QUEUE_INTERVAL_MS", 5_000, 1_000),
    retentionDays: integer("DELIVERY_RETENTION_DAYS", 30, 1),
    trustProxy: process.env.TRUST_PROXY === "1",
    pollStaleAfterMs: integer("POLL_STALE_AFTER_MS", 35 * 60 * 1000, 60_000),
    announcementConcurrency,
    apns,
    fcm,
  };
}
