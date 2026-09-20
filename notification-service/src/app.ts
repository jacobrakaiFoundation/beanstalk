import rateLimit from "@fastify/rate-limit";
import Fastify, { LogController, type FastifyInstance, type FastifyRequest } from "fastify";
import type { Writable } from "node:stream";
import type { AppDatabase } from "./database.js";
import { publicNotice } from "./database.js";
import type { ApnsEnvironment, DeviceRecord, DeviceRegistration, DeviceStore, PushIdentifierKind, PushProvider } from "./devices.js";
import type { PushSender } from "./push.js";
import type { NotificationQueue } from "./queue.js";

interface AppDependencies {
  database: AppDatabase;
  devices: DeviceStore;
  queue: NotificationQueue;
  sender: PushSender;
  now?: () => Date;
  logger?: boolean;
  /** Proxy hops to trust (0 = none). Never `true`: that trusts every hop and lets a client pick its own rate-limit key via X-Forwarded-For. */
  trustProxy?: number;
  logStream?: Writable;
  pollStaleAfterMs?: number;
}

interface ErrorBody {
  error: { code: string; message: string };
}

interface DeviceRegistrationBody {
  deviceToken?: string;
  environment?: ApnsEnvironment;
  provider?: PushProvider;
  pushIdentifier?: string;
  identifierKind?: PushIdentifierKind;
}

const deviceRegistrationSchema = {
  oneOf: [
    {
      type: "object",
      required: ["deviceToken", "environment"],
      additionalProperties: false,
      properties: {
        deviceToken: { type: "string", pattern: "^[A-Fa-f0-9]{64,200}$" },
        environment: { type: "string", enum: ["sandbox", "production"] },
      },
    },
    {
      type: "object",
      required: ["provider", "pushIdentifier", "environment"],
      additionalProperties: false,
      properties: {
        provider: { const: "apns" },
        pushIdentifier: { type: "string", pattern: "^[A-Fa-f0-9]{64,200}$" },
        identifierKind: { const: "token" },
        environment: { type: "string", enum: ["sandbox", "production"] },
      },
    },
    {
      type: "object",
      required: ["provider", "pushIdentifier", "identifierKind"],
      additionalProperties: false,
      properties: {
        provider: { const: "fcm" },
        pushIdentifier: { type: "string", minLength: 10, maxLength: 4096 },
        identifierKind: { type: "string", enum: ["fid", "token"] },
      },
    },
  ],
} as const;

function unauthorized(): ErrorBody {
  return { error: { code: "unauthorized", message: "A valid device bearer token is required" } };
}

function bearerFrom(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function decodeCursor(value: string | undefined): { publicationDate: string; id: string } | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("publicationDate" in parsed) ||
      !("id" in parsed) ||
      typeof parsed.publicationDate !== "string" ||
      typeof parsed.id !== "string" ||
      !Number.isFinite(Date.parse(parsed.publicationDate)) ||
      !/^notice_[a-f0-9]{32}$/u.test(parsed.id)
    ) {
      throw new Error("Invalid cursor");
    }
    return { publicationDate: parsed.publicationDate, id: parsed.id };
  } catch {
    throw new Error("cursor is invalid or expired");
  }
}

function registrationFromBody(body: DeviceRegistrationBody): DeviceRegistration {
  if (body.deviceToken !== undefined) {
    return {
      provider: "apns",
      pushIdentifier: body.deviceToken,
      environment: body.environment as ApnsEnvironment,
    };
  }
  if (body.provider === "fcm") {
    return {
      provider: "fcm",
      pushIdentifier: body.pushIdentifier as string,
      identifierKind: body.identifierKind as PushIdentifierKind,
    };
  }
  return {
    provider: "apns",
    pushIdentifier: body.pushIdentifier as string,
    identifierKind: "token",
    environment: body.environment as ApnsEnvironment,
  };
}

function deviceResponse(device: DeviceRecord): Omit<DeviceRecord, "pushIdentifier"> {
  return {
    id: device.id,
    provider: device.provider,
    identifierKind: device.identifierKind,
    environment: device.environment,
    active: device.active,
    disabledReason: device.disabledReason,
    terms: device.terms,
  };
}

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify's types take a predicate, not a hop count: trust exactly the
    // configured number of hops (hop 0 = the socket peer, i.e. cloudflared).
    trustProxy: (_address: string, hop: number): boolean => hop < (dependencies.trustProxy ?? 0),
    logController: new LogController({ disableRequestLogging: true }),
    logger: dependencies.logger
      ? {
          level: process.env.LOG_LEVEL ?? "info",
          redact: {
            paths: [
              "req.headers.authorization",
              "request.headers.authorization",
              "req.body.deviceToken",
              "request.body.deviceToken",
              "req.body.pushIdentifier",
              "request.body.pushIdentifier",
              "clientSecret",
            ],
            censor: "[REDACTED]",
          },
          ...(dependencies.logStream ? { stream: dependencies.logStream } : {}),
        }
      : false,
    bodyLimit: 32 * 1024,
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  const now = (): string => (dependencies.now ?? (() => new Date()))().toISOString();
  const staleAfterMs = dependencies.pollStaleAfterMs ?? 35 * 60 * 1000;

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      "request completed",
    );
  });

  app.setErrorHandler((error, request, reply) => {
    const requestError = error as Error & { validation?: unknown };
    if (requestError.validation) {
      void reply.status(400).send({ error: { code: "invalid_request", message: requestError.message } });
      return;
    }
    if (
      requestError.message === "cursor is invalid or expired" ||
      requestError.message.startsWith("A watchlist") ||
      requestError.message.startsWith("Each watchlist") ||
      requestError.message.startsWith("deviceToken") ||
      requestError.message.startsWith("pushIdentifier") ||
      requestError.message.startsWith("identifierKind") ||
      requestError.message.startsWith("provider")
    ) {
      void reply.status(400).send({ error: { code: "invalid_request", message: requestError.message } });
      return;
    }
    request.log.error({ err: error }, "request failed");
    void reply.status(500).send({ error: { code: "internal_error", message: "The request could not be completed" } });
  });

  app.get("/healthz", async (_request, reply) => {
    const state = dependencies.database.getPollState();
    const checkedAt = now();
    const queue = dependencies.queue.health(checkedAt);
    const pushDisabled = !dependencies.sender.configured;
    const pushProviders = {
      apns: dependencies.sender.isConfigured("apns"),
      fcm: dependencies.sender.isConfigured("fcm"),
    };
    const lastSuccessMilliseconds = state.lastSuccessAt ? Date.parse(state.lastSuccessAt) : Number.NaN;
    const stale =
      !state.initialized ||
      !Number.isFinite(lastSuccessMilliseconds) ||
      Date.parse(checkedAt) - lastSuccessMilliseconds > staleAfterMs;
    const unhealthy =
      !state.initialized ||
      stale ||
      state.gapStatus !== "normal" ||
      state.consecutiveFailures > 0 ||
      queue.recentPushFailures > 0;
    dependencies.database.connection.prepare("SELECT 1").get();
    return reply.status(unhealthy ? 503 : 200).send({
      status: unhealthy ? "unhealthy" : pushDisabled ? "degraded" : "ok",
      database: "ok",
      pushDisabled,
      pushProviders,
      poll: {
        initialized: state.initialized,
        stale,
        staleAfterSeconds: Math.floor(staleAfterMs / 1000),
        lastPollAt: state.lastPollAt,
        lastSuccessAt: state.lastSuccessAt,
        consecutiveFailures: state.consecutiveFailures,
        gapStatus: state.gapStatus,
        gapReason: state.gapReason,
        lastReconcileAt: state.lastReconcileAt,
        lastError: state.lastError,
      },
      queue,
    });
  });

  app.get<{ Querystring: { limit?: number; cursor?: string; query?: string } }>(
    "/v1/notices",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            cursor: { type: "string", minLength: 1, maxLength: 500 },
            query: { type: "string", minLength: 1, maxLength: 120 },
          },
        },
      },
    },
    async (request) => {
      const cursor = decodeCursor(request.query.cursor);
      return dependencies.database.listNotices({
        limit: request.query.limit ?? 25,
        ...(cursor ? { cursor } : {}),
        ...(request.query.query?.trim() ? { query: request.query.query.trim() } : {}),
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/notices/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", pattern: "^notice_[a-f0-9]{32}$" } },
        },
      },
    },
    async (request, reply) => {
      const notice = dependencies.database.getStoredNotice(request.params.id);
      if (!notice || notice.foodClassification !== "food") {
        return reply.status(404).send({ error: { code: "not_found", message: "Recall notice not found" } });
      }
      return publicNotice(notice);
    },
  );

  app.post<{ Body: DeviceRegistrationBody }>(
    "/v1/devices",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: deviceRegistrationSchema,
      },
    },
    async (request, reply) =>
      reply.status(201).send(dependencies.devices.create(registrationFromBody(request.body), now())),
  );

  const authenticate = (request: FastifyRequest): DeviceRecord | null => {
    const bearer = bearerFrom(request);
    return bearer ? dependencies.devices.authenticate(bearer) : null;
  };

  app.get("/v1/devices/me", async (request, reply) => {
    const device = authenticate(request);
    if (!device) return reply.status(401).send(unauthorized());
    return deviceResponse(device);
  });

  app.put<{ Body: DeviceRegistrationBody }>(
    "/v1/devices/me/token",
    {
      schema: {
        body: deviceRegistrationSchema,
      },
    },
    async (request, reply) => {
      const device = authenticate(request);
      if (!device) return reply.status(401).send(unauthorized());
      dependencies.devices.updateToken(device.id, registrationFromBody(request.body), now());
      return deviceResponse(dependencies.devices.get(device.id) as DeviceRecord);
    },
  );

  app.put<{ Body: { terms: string[] } }>(
    "/v1/devices/me/watchlist",
    {
      schema: {
        body: {
          type: "object",
          required: ["terms"],
          additionalProperties: false,
          properties: {
            terms: {
              type: "array",
              maxItems: 20,
              uniqueItems: true,
              items: { type: "string", minLength: 2, maxLength: 80 },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const device = authenticate(request);
      if (!device) return reply.status(401).send(unauthorized());
      const terms = dependencies.devices.setWatchlist(device.id, request.body.terms, now());
      return { terms };
    },
  );

  app.delete("/v1/devices/me", async (request, reply) => {
    const device = authenticate(request);
    if (!device) return reply.status(401).send(unauthorized());
    dependencies.devices.delete(device.id);
    return reply.status(204).send();
  });

  return app;
}
