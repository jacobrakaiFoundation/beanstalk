# Play Data safety inputs

Inputs for the Play Console Data safety form for the native Compose app in
`android/` (`applicationId` `org.jacobrakaifoundation.beanstalk`). This is not
the Capacitor sideload in `android-apk/`, which does not call the Foundation
API.

Form questions follow [Provide information for Google Play's Data safety
section](https://support.google.com/googleplay/android-developer/answer/10787469).
"Collected" means transmitted off the device. Ephemeral processing still has
to be answered in the form; Play may omit it from the public listing when the
data is kept only in memory long enough to serve the request. The first party
is JACOBRAKAI FOUNDATION. FDA and Google are third parties.

Anything this repository does not prove is marked **UNVERIFIED**. Do not paste
this file into Play Console without checking it against the binary you upload.

## Binary this tree actually builds

`google-services.json` is not in the repo. The manifest sets
`firebase_messaging_auto_init_enabled`, `firebase_analytics_collection_enabled`,
and `firebase_data_collection_default_enabled` to false, and removes
`FirebaseInitProvider`, `FirebaseMessagingService`, and
`FirebaseInstanceIdReceiver`. `ColdStartResilienceTest` asserts that a cold
start has no `FirebaseApp` and that those components are absent.

A release built only from this tree does not initialize Firebase and does not
obtain an FCM token. The alert code
(`NotificationCoordinator`, `BeanstalkApi.registerDevice`) sends device data
only after `FirebaseApp` exists. Rows below that depend on that path are
marked "alerts build".

## Form-level answers

**Does the app collect or share any of the required user data types?** Yes.

**Is all of the user data collected by your app encrypted in transit?** Yes,
for the requests this app makes. `BeanstalkApi` uses only `https://` URLs
(`https://api.beanstalk.jacobrakai.org` and
`https://api.fda.gov/food/enforcement.json`). There is no
`networkSecurityConfig`, no `usesCleartextTraffic`, and no custom trust
manager. `targetSdk` 36 blocks cleartext by default. OkHttp uses the platform
TLS stack.

**UNVERIFIED:** TLS configuration of the production host in front of
`api.beanstalk.jacobrakai.org` (certificate, proxy, whether it accepts
anything other than HTTPS). The app never requests a cleartext URL.

**Do you provide a way for users to request that their data is deleted?** Yes.

- Settings → **Turn alerts off** calls `DELETE /v1/devices/me`, then clears
  the on-device credential. The service deletes that `devices` row.
  `foreign_keys` is on, and `watch_terms` and `delivery_queue` reference
  `devices` with `ON DELETE CASCADE`, so those rows go with it.
- Settings → **Clear saved data** deletes local saved recalls, watch terms,
  and the HTTP cache. If a device registration still exists, it then syncs
  the now-empty watchlist. It does not delete the device row or the FCM
  token. The credential stays until Turn alerts off.
- Uninstall removes local files. It does not call `DELETE /v1/devices/me`.
  If the push sender later returns an invalid token (`UNREGISTERED` /
  `INSTALLATION_ID_NOT_REGISTERED` are in the FCM invalid set), the service
  disables that device. Inactive devices are deleted after
  `DELIVERY_RETENTION_DAYS` (default 30). **UNVERIFIED:** that an uninstall
  always produces that FCM error before the user taps Turn alerts off.

There is no account, email, or name. **UNVERIFIED:** whether Play Console
still shows the account-deletion URL question for this device registration.
The app has no account-creation flow to point that URL at.

## Data types

On-device saved recalls, watch terms while alerts are off, and the HTTP cache
stay in `beanstalk.sqlite`. They are not collected. The device credential
(random id, client secret, and push token, when one exists) is encrypted with
Android Keystore AES/GCM in the `encrypted_device_credentials`
SharedPreferences. The SQLite file is not SQLCipher.

| Play data type | Collected or shared | What leaves the device | Purpose | Required or optional | Ephemeral |
| --- | --- | --- | --- | --- | --- |
| App activity → In-app search history | Collected by the Foundation. Also transmitted to FDA for enforcement search | Notice search text is sent to `GET /v1/notices?query=`. Enforcement search text, classification, and status are sent to `api.fda.gov` | App functionality | Optional. Browse works with an empty query | Notice query: yes for the Foundation. The handler uses it as a SQL parameter and does not store it. Request logs record the route template, not the query (`notification-service` test "logs route and status without retaining query terms, tokens, or remote IP"). Enforcement query: the Foundation never receives it. **UNVERIFIED:** how long FDA keeps that request |
| App activity → Other user-generated content | Collected by the Foundation on an alerts build | Watch terms (2–80 characters, at most 20), sent to `PUT /v1/devices/me/watchlist` after the user enables alerts | App functionality | Optional. Alerts stay off unless the user turns them on, and this tree cannot turn them on | No. Kept on the device row until deletion or until a later sync replaces them |
| Device or other IDs | Collected by the Foundation and shared with Google, alerts build only | FCM registration token (`identifierKind` `"token"`) from `FirebaseMessaging.getInstance().token`, sent to `POST /v1/devices` or `PUT /v1/devices/me/token`. Random `deviceId` returned by the service and stored with the credential. The FCM HTTP body is the token, a fixed notification string, and `data.noticeId`. It does not include the watch term (`notification-service/src/fcm.ts`) | App functionality | Optional | No. The token and device id stay until the device row is deleted |
| Diagnostics | Collected by the Foundation, alerts build only | Delivery rows: notice id, matched term, status, attempt count, error code, timestamps | App functionality | Optional (only if alerts were on and a notice matched) | No. `queue.prune` deletes every delivery row older than the retention window, including queued and retrying rows |

Not collected, from this code and the release classpath:

- Name, email address, phone, address, or other personal info. No account.
- User IDs that identify a person. The random device id is covered above as a device id, not an account id.
- Approximate or precise location.
- Financial info. The native app has no donate control and no Stripe SDK. Payment on the Foundation site happens only if a person opens that site outside this app.
- Photos, audio, files, contacts, calendar, messages, web browsing, health, or installed apps. No WebView.
- Crash logs or analytics from an app SDK. No Crashlytics, Sentry, or `firebase-analytics` artifact. `firebase-measurement-connector` is an API stub. Android Vitals is Play's own collection, not an app SDK.
- Advertising ID. The merged release manifest has no `AD_ID` permission.

`Clear saved data` and ordinary browsing do not upload the saved-recall list.
Opening a notice sends a public notice id to `GET /v1/notices/{id}`. The
service log stores the route template. That id is not an account identifier
and is not stored as a per-device history.

## Purposes not used

Do not select Analytics, Advertising or marketing, Fraud prevention as a
separate purpose, Personalization, or Account management. The server stores a
SHA-256 of `deviceId + "." + clientSecret` (`DeviceStore.hashSecret`) so it
can authenticate the bearer token. The client secret itself is not stored on
the server. That hash is the app credential, not a profile.

## Deletion timing for alert data

| Data | When it is deleted |
| --- | --- |
| Active device row, its watch terms, and its delivery rows | When the user turns alerts off (`DeviceStore.delete` plus foreign-key cascade) |
| Device disabled because the push token was rejected | `disableIfCurrent`, then `pruneInactive` when `updated_at` is older than `DELIVERY_RETENTION_DAYS` (default 30). Cleanup runs at startup and daily |
| Delivery rows, any status | `created_at` older than the same 30-day window |
| Backup copies | `notification-service/scripts/backup.sh` defaults `BACKUP_RETENTION_DAYS` to 14 and deletes older backup files on that schedule. A deleted device can remain in a backup until that window ends. Restore marks every restored device `restored_quarantine` and cancels pending deliveries |

Recall notice rows are public FDA records kept for deduplication. They are
not user data.

**UNVERIFIED:** whether the production disk and backup volume are encrypted.
The service README says host backups must be encrypted and the scripts set
file mode `0600`. This repo does not contain the host configuration.
**UNVERIFIED:** logs on the HTTPS proxy in front of the service. The
application logger does not record query strings, bearer tokens, push
identifiers, or the client IP.

## Third-party SDKs on `releaseRuntimeClasspath`

| SDK | What this repo shows it does |
| --- | --- |
| AndroidX (Compose, navigation, lifecycle, core, profileinstaller) and OkHttp 5.4.0 | UI, local profile install, and HTTPS. No analytics endpoint in app code |
| `com.google.firebase:firebase-messaging` 25.1.3 (BOM 34.19.0) | Would obtain an FCM token and receive messages after Firebase is initialized. This manifest prevents that initialization |
| `firebase-installations` 19.1.2 | Packaged. The app registers `identifierKind: "token"`, not an FID. **UNVERIFIED:** whether a build that restores `FirebaseInitProvider` would still create a Firebase installation id while the collection flags stay false |
| `firebase-datatransport` 18.2.0 and `transport-backend-cct` 3.1.9 | Packaged with the messaging SDK. Collection flags are false and there is no `FirebaseApp` in this tree. No upload is implemented in app code. **UNVERIFIED:** transport behavior if a later build restores Firebase init |
| `play-services-cloud-messaging` 17.4.0, `play-services-base` 18.9.0, `play-services-basement` 18.9.0 | Play services libraries pulled in by Firebase Messaging |
| Kotlin coroutines and kotlinx.serialization | Local only |

No ads SDK and no Play services ads-identifier library.

## Auto Backup

`android:allowBackup` is the Auto Backup switch. There is no
`dataExtractionRules` or `fullBackupContent` resource. When the attribute is
`true`, Android can copy `beanstalk.sqlite` and the
`encrypted_device_credentials` preferences to the user's Google account. The
Keystore key is not in that backup. That copy is not a Foundation collection.

In the commit this document was added, the attribute is `true`. A separate
change sets it to `false`. Answer from the manifest in the artifact you
upload.

## Security-practices checkboxes

- Encrypted in transit: Yes, with the proxy caveat above.
- Users can request deletion: Yes, via Turn alerts off and Clear saved data,
  with the retention windows above.
- Independent security review: No. This repo has no MASA letter.
- Families policy badge: out of scope for this note. **UNVERIFIED:** the
  target-audience answers in Play Console.
