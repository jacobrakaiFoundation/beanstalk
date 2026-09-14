import { createApnsPushSender } from "./apns.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { AppDatabase } from "./database.js";
import { DeviceStore } from "./devices.js";
import { createFcmPushSender } from "./fcm.js";
import { FdaPoller, type PollLogger } from "./poller.js";
import { NotificationQueue } from "./queue.js";
import { RoutedPushSender } from "./push.js";
import { HttpFdaSource } from "./sources.js";

const config = loadConfig();
const database = new AppDatabase(config.databasePath);
const devices = new DeviceStore(database);
const sender = new RoutedPushSender([
  createApnsPushSender(config.apns),
  createFcmPushSender(config.fcm),
]);
const queue = new NotificationQueue(database, devices, sender);
const startupRetentionCutoff = new Date(Date.now() - config.retentionDays * 86_400_000).toISOString();
queue.prune(startupRetentionCutoff);
devices.pruneInactive(startupRetentionCutoff);
queue.recoverInterrupted(new Date().toISOString());
const app = await buildApp({
  database,
  devices,
  queue,
  sender,
  logger: true,
  trustProxy: config.trustProxy,
  pollStaleAfterMs: config.pollStaleAfterMs,
});
const pollLogger: PollLogger = {
  info: (data, message) => app.log.info(data, message),
  warn: (data, message) => app.log.warn(data, message),
  error: (data, message) => app.log.error(data, message),
};
const poller = new FdaPoller(
  database,
  queue,
  new HttpFdaSource(config.rssUrl, config.annualXmlUrls),
  () => new Date(),
  pollLogger,
  config.announcementConcurrency,
);

let pollRunning = false;
let queueRunning = false;
let shuttingDown = false;

async function runPoll(): Promise<void> {
  if (pollRunning || shuttingDown) return;
  pollRunning = true;
  try {
    await poller.pollOnce();
  } catch {
    // The poller records and logs sanitized failure details in persistent health state.
  } finally {
    pollRunning = false;
  }
}

async function runQueue(): Promise<void> {
  if (queueRunning || shuttingDown) return;
  queueRunning = true;
  try {
    const count = await queue.processDue(new Date().toISOString());
    if (count > 0) app.log.info({ deliveryCount: count }, "notification queue batch completed");
  } catch (error) {
    app.log.error({ err: error }, "notification queue batch failed");
  } finally {
    queueRunning = false;
  }
}

const pollTimer = setInterval(() => void runPoll(), config.pollIntervalMs);
pollTimer.unref();
const queueTimer = setInterval(() => void runQueue(), config.queueIntervalMs);
queueTimer.unref();
const retentionTimer = setInterval(
  () => {
    const before = new Date(Date.now() - config.retentionDays * 86_400_000).toISOString();
    const deliveryCount = queue.prune(before);
    const deviceCount = devices.pruneInactive(before);
    if (deliveryCount > 0 || deviceCount > 0) {
      app.log.info(
        { prunedDeliveryCount: deliveryCount, prunedInactiveDeviceCount: deviceCount },
        "expired private records pruned",
      );
    }
  },
  86_400_000,
);
retentionTimer.unref();

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "graceful shutdown started");
  clearInterval(pollTimer);
  clearInterval(queueTimer);
  clearInterval(retentionTimer);
  await app.close();
  sender.close();
  database.close();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.host, port: config.port });
app.log.info(
  {
    host: config.host,
    port: config.port,
    pushDisabled: !sender.configured,
    pushProviders: { apns: sender.isConfigured("apns"), fcm: sender.isConfigured("fcm") },
  },
  "Beanstalk notification service listening",
);
void runPoll();
void runQueue();
