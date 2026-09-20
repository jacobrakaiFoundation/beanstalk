# Beanstalk notification service

This Node 22 service ingests FDA recall announcements, exposes food recall notices to the iPhone and Android apps, stores device watchlists, and sends matching notifications through APNs or Firebase Cloud Messaging (FCM). The first successful poll seeds current RSS history without sending notifications. Only later, verified RSS additions can create delivery jobs. The openFDA enforcement archive is deliberately not used for alerts.

## Local development

```sh
cp .env.example .env
npm ci
npm run migrate
npm run dev
```

Ingestion and read APIs work without push credentials. Delivery jobs remain queued without consuming attempts until their registered provider is configured. `/healthz` reports each provider under `pushProviders`; when neither provider is configured it reports `status: "degraded"` and `pushDisabled: true` so monitoring cannot mistake this for working push delivery.

## Public API

All request bodies reject unknown properties. Global rate limiting is 120 requests per minute per client IP; device registration is limited to 10 per minute.

- `GET /healthz`
- `GET /v1/notices?limit=25&cursor=...&query=...` returns `{ "items": RecallNotice[], "nextCursor": string | null }`
- `GET /v1/notices/:id` returns one `RecallNotice`
- `POST /v1/devices` with legacy iPhone `{ "deviceToken": string, "environment": "sandbox" | "production" }`, generic APNs `{ "provider": "apns", "pushIdentifier": string, "environment": "sandbox" | "production" }`, or Android `{ "provider": "fcm", "pushIdentifier": string, "identifierKind": "fid" }` returns `{ "deviceId": string, "clientSecret": string }` once
- `GET /v1/devices/me`
- `PUT /v1/devices/me/token` with the same provider-specific registration shape rotates an APNs token or Firebase Installation ID (FID). FCM registration tokens remain accepted with `"identifierKind": "token"` only for Firebase's transition period.
- `PUT /v1/devices/me/watchlist` with `{ "terms": string[] }`
- `DELETE /v1/devices/me`

Authenticated routes use `Authorization: Bearer <deviceId>.<clientSecret>`. The client secret is random and only its SHA-256 digest, salted with the device ID, is stored. The iPhone app keeps it in Keychain and the Android app keeps it in Android Keystore-backed storage. Device responses include `provider` and `identifierKind` but never return the push identifier.

`RecallNotice` has this stable JSON shape:

```json
{
  "id": "notice_...",
  "title": "...",
  "summary": "Full official company announcement wording...",
  "productDescription": "Cheese",
  "reasonForRecall": "Undeclared Egg",
  "companyName": "Whole Foods Market",
  "classification": null,
  "status": null,
  "distribution": "Official distribution wording...",
  "codeInfo": "Product Description: Cabricharme Raw Milk Cheese · PLU: 57953 · States: California, New Jersey · Best By Dates: Through 10/7/2026\n...",
  "publicationDate": "2026-09-11T22:15:00.000Z",
  "recallInitiationDate": null,
  "retrievedAt": "2026-09-13T20:00:00.000Z",
  "sourceURL": "https://www.fda.gov/..."
}
```

RSS descriptions are truncated, so the service fetches each new linked FDA announcement before storing or matching it. It preserves the complete `#recall-announcement` text in `summary`, FDA Summary values for company/product/reason, official table rows and identifier paragraphs in `codeInfo`, and official distribution wording when present. FDA company-announcement pages do not reliably provide enforcement classification, status, or recall-initiation date, so those fields remain `null` instead of being inferred. The RSS GUID remains internal.

## Source and delivery safety

The service polls the official Food Safety Recalls RSS URL every 15 minutes. It fetches seed or new announcement pages at no more than four concurrent requests by default. Every request requires HTTPS on `fda.gov`, rejects credentials and non-default ports, revalidates each redirect, times out, and cancels streamed bodies as soon as they exceed the byte cap. A redirect to a different canonical recall URL fails closed. The page's official Product Type is the primary food-scope classifier. A narrow content guard overrides it when the official title/body is plainly a drug, device, cosmetic, tobacco, or sexual-enhancement product; this is necessary because FDA pages have contained conflicting Food Product Type metadata. Non-food entries are retained internally as `unknown`, excluded from public endpoints, and never queued.

If any required new announcement cannot be fetched or parsed, the poll enters `failed`, no truncated row is stored, and all notification delivery pauses. Existing enriched pages are not fetched again during each 15-minute poll. Watch terms are normalized with Unicode NFKC, lowercased, deduplicated, and matched at Unicode letter/number boundaries across the full official fields. This keeps `salmon` from matching `salmonella` and `cod` from matching `code`.

If the prior RSS cursor disappears, delivery pauses before ingesting new alerts. The service downloads every official annual dataset listed in `FDA_ANNUAL_XML_URLS` and reconciles by canonical FDA URL. At most two annual URLs may be configured, covering the current and prior year; each response retains its 50 MB download cap. Delivery resumes only when one contains the old cursor and every configured source fetched and parsed successfully. Current RSS rows newer than the old cursor may then alert after their linked pages are enriched; annual data is never used as alert content, and annual-only records remain silent. The gap and its outcome remain visible in `/healthz`. During year rollover, configure current-year and prior-year official XML URLs as a comma-separated pair before the first January poll.

Each notice/device pair has one durable queue row. The worker rechecks that polling is initialized and the gap state is `normal` before every claim and immediately before every send. Notices more than 24 hours past their FDA publication timestamp, or with missing, invalid, or future publication timestamps, are canceled instead of sent; this also drains expired queued and retrying backlog while delivery is paused or a provider is unavailable. The 24-hour publication window accommodates normal FDA publishing and reconciliation delay. APNs and FCM messages expire one hour after each send attempt. Transient provider errors retry after capped exponential backoff, up to eight attempts; FCM `Retry-After` is honored, including its required one-minute minimum for quota errors. APNs invalid-token and FCM unregistered-installation responses disable that device. A fresh registration can transfer a current identifier within its provider, making the prior credentials terminal. Normal active credentials can rotate to an unclaimed identifier, and restore-quarantined credentials can explicitly reactivate; all other inactive credentials are rejected. Removing a watch term cancels unsent jobs created for that term. APNs notifications include `noticeId`, `matchedTerm`, and `matchedField` for deep linking and visible match evidence. Android FCM sends use the app's `recall_matches` channel and contain only a generic alert and `noticeId`; the app recomputes visible match evidence from the fetched notice and its local watch terms. Android sends use the current HTTP v1 `fid` target; the deprecated `token` target is retained only for existing clients during Firebase's transition.

`/healthz` returns HTTP 503 when polling is uninitialized, stale beyond 35 minutes by default, gap-paused, or has recent permanent APNs or FCM failures. It exposes timestamps and counters for the last successful poll, reconciliation, provider failures, sent notification, and oldest pending job. Missing all push credentials returns HTTP 200 with `status: "degraded"` and `pushDisabled: true`. The monitor enforces these states; use `REQUIRE_PUSH=1` for either provider, `REQUIRE_APNS=1` for APNs, and `REQUIRE_FCM=1` for FCM. It also fails when a pending job exceeds `MAX_PENDING_AGE_SECONDS` (30 minutes by default) or when queued, retrying, and sending jobs exceed `MAX_PENDING_JOBS` (1,000 by default).

## Malachi deployment

Docker Compose is the canonical path because the host Node runtime is older than the required Node 22 runtime. Docker Engine with the Compose plugin, plus `curl` and `jq` for monitoring, are host prerequisites. The service binds only to `127.0.0.1:8787`; the existing HTTPS proxy or tunnel should be the sole public entry point. Compose limits the service to 768 MB of memory, one CPU, and 128 processes so a malformed or unexpectedly large source cannot exhaust the shared host.

1. Place this directory at `/opt/beanstalk/notification-service`, copy `.env.example` to `.env`, and create `secrets/` with mode `0700`.
2. Set the FDA annual XML URL for the active year. Leave APNs and FCM variables blank until their credentials exist.
3. Run `docker compose build` and `docker compose up -d`.
4. Route the chosen HTTPS hostname to `http://127.0.0.1:8787`, then run `HEALTH_URL=https://HOST/healthz scripts/monitor.sh`. Once a mobile release depends on a provider, set its matching `REQUIRE_APNS=1` or `REQUIRE_FCM=1` monitoring flag. Tune the pending-age and pending-count thresholds only from measured production capacity.
5. Optionally install `deploy/beanstalk-notifications.service` to manage Compose at boot.

After a change to how FDA pages are read, notices already stored keep their old text because the poller enriches a notice once. Re-read the most recent RSS notices in place, without sending any notification, with `docker compose exec notifications node dist/reenrich.js 50` (limit 1-500; `src/reenrich.ts` documents what it keeps and logs). iPhone clients cache notice responses for up to 6 hours (`ios/App/Networking/APIClient.swift`), so re-enriched text can take that long to reach an already-installed app.

For APNs, mount the `.p8` file under `secrets/`, set `APNS_PRIVATE_KEY_PATH=/run/secrets/<file>.p8`, and set the team ID, key ID, and app bundle ID. Keep `.env` mode `0600` and `secrets/` mode `0700`. Do not place a private key in the image or repository.

For FCM, enable the Firebase Cloud Messaging API, create a narrowly scoped service account with permission to send messages, and mount its JSON file under `secrets/`. Set `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_PATH=/run/secrets/<file>.json`, and `FCM_ANDROID_PACKAGE_NAME=org.jacobrakaifoundation.beanstalk`. The package name is included as FCM's `restricted_package_name` delivery guard. The Google Auth Library exchanges the service credential for a short-lived token with only the `firebase.messaging` scope. Do not place `google-services.json`, a service-account file, or its private key in the image or repository.

## Storage, retention, and recovery

The `/data` volume contains SQLite state and must be limited to the service account. The service sets a restrictive `0077` process umask, enforces `0700` on its database directory, and enforces `0600` on the database, WAL, and SHM files. The backup and restore scripts apply the same restrictions even when invoked from a permissive shell. The raw APNs token or FCM FID is stored because the provider requires it for delivery; client secrets are never stored. Active devices and watchlists remain until client deletion. Inactive replaced or invalid devices and their watchlists are deleted after 30 days. Every delivery row, including queued and retrying rows, is deleted after 30 days. Cleanup runs at startup and daily. Recall source records are retained for durable deduplication.

For Android notification delivery, Google receives the FID, a generic notification title/body, and `noticeId`. Beanstalk does not send watch terms, matched text, or recall details through FCM, does not enable Firebase Analytics, and does not use FCM delivery data for advertising. Google processes the limited payload as the notification delivery provider; this transfer must be reflected in the public privacy notice and Google Play Data safety answers.

Search terms are accepted in URL queries but Fastify's raw request logging is disabled, so query strings and remote IP addresses are not retained by this service. Service logs contain only method, route template, status, duration, bounded error codes, and operational counters. Authorization headers, device tokens, and returned client secrets are redacted or omitted. The HTTPS proxy or tunnel must also be configured not to retain query strings; its logging policy is outside this service.

Run `scripts/backup.sh` against a host-visible database path or inside a maintenance container with the data volume mounted. It uses SQLite's online backup operation, checkpoints the copy, switches it to DELETE journal mode, removes sidecars, and checks integrity. `BACKUP_RETENTION_DAYS` must be a positive integer and defaults to 14. Schedule the backup job at least daily; at each run it deletes backup files and pre-restore snapshots older than `(days - 1) × 24 hours`, keeping the maximum age within the configured number of days on that schedule. Restore also applies the same cleanup immediately. Deleted device and watchlist data can therefore remain in rotating backups or pre-restore snapshots for up to 14 additional days. These files contain device tokens and watchlists, use `0600` permissions, and require encrypted host backups.

For restore, stop the service, set `DATABASE_PATH`, and run `scripts/restore.sh --confirm /absolute/path/to/backup.sqlite`. The script verifies the backup, quarantines a temporary candidate, checkpoints it, switches it to DELETE journal mode, and verifies it before atomically replacing the live database. Cleanup traps remove the candidate and its WAL/SHM sidecars on success or failure. Every restored device is disabled as `restored_quarantine`, and every queued, retrying, or in-flight delivery is permanently canceled. This prevents a backup from resurrecting an opt-out or replaying an old push. A client that still holds valid credentials can explicitly reactivate only by refreshing its current provider identifier through `PUT /v1/devices/me/token`; canceled deliveries remain canceled.

## Release checks

```sh
npm run check
docker compose config
docker build -t beanstalk-notifications:test .
```

No live APNs or FCM credentials are required or used by the automated test suite.
