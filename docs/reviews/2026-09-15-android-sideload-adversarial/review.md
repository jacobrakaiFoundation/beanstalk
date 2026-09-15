# Beanstalk Android sideload APK adversarial review

**Recommendation: request changes before treating the native APK as a working client.** Two P1 findings and four P2 findings follow. The Capacitor artifact remains the only sideload path that can search. This is a local review of already-merged [PR #163](https://github.com/jacobrakaiFoundation/beanstalk/pull/163); no GitHub review was submitted, and this document makes no application changes.

Reviewed on September 15, 2026 against squash `2291efc` (`feat(android): shippable sideload APK (#163)`). Current `main` is `4e95c2e`. Later commits are Dependabot-only and do not touch the cited Android glue. PR discussion had no reviews, review threads, or BugBot comments.

Scope is code added or modified by #163: Capacitor packaging in `android-apk/`, native assemble glue (`BeanstalkApi`, `NotificationCoordinator`, `Models`, manifests, Gradle wrapper), and CI assemble jobs. Pre-existing `WatchlistSyncEngine` behavior from #144 is excluded unless this PR newly ships a break.

## High priority: repair before treating native as usable

**1. [P1] Native Latest and Historical HTTP runs on the main thread.**

[#163 added](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/data/network/BeanstalkApi.kt#L137) `BeanstalkApi.execute()` as a blocking `OkHttpClient.newCall().execute()`. The new methods are `suspend` but never switch dispatchers. [BeanstalkViewModel.kt:126](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/ui/BeanstalkViewModel.kt#L126) loads both browse modes with bare `viewModelScope.launch`, which is `Dispatchers.Main.immediate`. Android forbids network on that thread (`NetworkOnMainThreadException`). Local Room work already uses `Dispatchers.IO`; the new API client does not.

This is independent of the documented `api.beanstalk.jacobrakai.org` DNS caveat. Historical search calls `https://api.fda.gov/food/enforcement.json` through the same `execute()`. On a device or emulator with StrictMode, native Latest and Historical cannot populate. Confirmed from source control flow and the Android platform contract; no emulator walkthrough was performed. Move `execute()` onto `Dispatchers.IO` (or replace it with an async client) and keep UI collection on Main.

**2. [P1] Native push registration sends an FCM token as a Firebase Installation ID and rotates on a route that does not exist.**

[#163 `NotificationCoordinator.kt:75`](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/notifications/NotificationCoordinator.kt#L75) is named `firebaseInstallationId()` but reads `FirebaseMessaging.getInstance().token`. [#163 `FcmRegistrationBody`](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/data/network/BeanstalkApi.kt#L159) defaults `identifierKind` to `"fid"`. The live service rejects that pair: [devices.ts:77](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/notification-service/src/devices.ts#L77) requires `^[A-Za-z0-9_-]{10,200}$` for FIDs. FCM registration tokens contain `:` and are not URL-safe FIDs. The probe posts the token labeled `fid` and receives `400 invalid_request`. The same token labeled `token` returns `201`.

Even if registration succeeded as `fid`, [fcm.ts:114](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/notification-service/src/fcm.ts#L114) sends `{ fid }` versus `{ token }`. A registration token stored as an FID is not a valid FCM target.

Token refresh is also wrong. iOS rotates at `PUT /v1/devices/me/token`. [#163 `updatePushIdentifier`](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/data/network/BeanstalkApi.kt#L106) uses `PUT /v1/devices/me`. That method is not registered; the probe returns `404 Not Found`. The real rotate handler returns `{ id, provider, identifierKind, ... }` and never returns `{ deviceId, clientSecret }`. The new client decodes rotate as `DeviceRegistrationResponse`. A later fix that only changes the path would then fail JSON decode.

The PR text says native alerts wait on `google-services.json`. That does not make the contract safe: `firebase-messaging` is already a compile dependency, `FirebaseInitProvider` is merged into the native APK, and any later Play/FCM enablement hits this body unchanged. Send `identifierKind: "token"` for `FirebaseMessaging.token`, rotate at `/v1/devices/me/token`, and do not decode rotate as a registration-create payload. If the product wants FID targeting, read `FirebaseInstallations.getId()` instead of the FCM token.

## Recall search and notification packaging

**3. [P2] Native never creates the `recall_matches` channel the sender requires.**

[fcm.ts:136](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/notification-service/src/fcm.ts#L136) sets `android.notification.channel_id` to `recall_matches`. #163 adds `POST_NOTIFICATIONS` and a permission launcher, and it merges `FirebaseMessagingService`, but no `NotificationChannel` is created. On API 26+ the system drops or silences notification-payload FCM until that channel exists. Confirmed from source and the merged native APK manifest dump; physical delivery was not measured.

**4. [P2] The recommended Capacitor APK cannot request Android 13+ notification permission.**

The sideload path Jacob is told to install is `android-apk/`. Its [#163 manifest](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android-apk/app/src/main/AndroidManifest.xml#L40) declares only `INTERNET`. `aapt dump permissions` on the assembled Capacitor APK matches that. The wrapped PWA still calls `new Notification()` from `food-recall-app/src/lib/notifications.ts`. On API 33+ that requires `POST_NOTIFICATIONS`. Search still works; OS watchlist alerts on the recommended APK do not. Add the permission (and a Capacitor prompt) if those alerts are in scope for sideload.

**5. [P2] New Android query construction drops the iOS sanitizer, 120-character cap, and openFDA skip guard.**

[#163 `BeanstalkApi.notices`](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/data/network/BeanstalkApi.kt#L39) forwards the raw query. The service schema is `maxLength: 120`. The probe `GET /v1/notices?query=` + 121 `x` returns `400`. [#163 `enforcement`](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/data/network/BeanstalkApi.kt#L53) interpolates the raw string into Lucene quotes. iOS [QueryBuilders.swift:81](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/ios/Core/Sources/BeanstalkCore/QueryBuilders.swift#L81) strips `"` and `\` and rejects `skip > 25_000`. A quoted historical search or a deep page will 400 against openFDA. Mirror the iOS sanitizer and caps.

**6. [P2] Completing `DeviceCredentials` breaks the existing last-term-removal unit tests.**

#144 left `DeviceCredentials` imported but undefined. #163 added [Models.kt:113](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android/app/src/main/java/org/jacobrakaifoundation/beanstalk/data/model/Models.kt#L113) with `deviceId`, matching the repository and create-device JSON. [WatchlistSyncEngineTest.kt:58](https://github.com/jacobrakaiFoundation/beanstalk/blob/2291efc/android/app/src/test/java/org/jacobrakaifoundation/beanstalk/data/WatchlistSyncEngineTest.kt#L58) still reads `deviceID` (iOS-style). `./gradlew :app:testDebugUnitTest` fails at compile:

```
e: WatchlistSyncEngineTest.kt:58:33 Unresolved reference 'deviceID'.
e: WatchlistSyncEngineTest.kt:59:41 Unresolved reference 'deviceID'.
e: WatchlistSyncEngineTest.kt:65:45 Unresolved reference 'deviceID'.
```

CI only assembles; it does not run these tests. The #144 probes for final-term removal therefore cannot run on the merged tree. Rename the test property to `deviceId`.

## Not findings

- Debug keystore and missing Play upload secrets are the stated sideload contract.
- Missing `google-services.json` is documented. `NotificationCoordinator` already returns a local-only message when `FirebaseApp.getApps()` is empty. Launch crash without that file was not reproduced.
- Shared `applicationId` across the two APKs is documented.
- GitHub Pages still defaults to `/beanstalk/`. Web `VITE_BASE=/` is Capacitor-only.
- Pre-existing `WatchlistSyncEngine` acknowledgement races from the September 13 review are unchanged unless the new test compile break is counted, which is finding 6.
- `api.beanstalk.jacobrakai.org` may be unresolved; that is already in the PR body and does not excuse finding 1 on the openFDA path.

## Evidence and limits

Contract probes import the unchanged notification-service implementation and record actual HTTP status codes. Run from the repository root after `npm install` in `notification-service/` (rebuild `better-sqlite3` if install used `--ignore-scripts`):

```sh
node notification-service/node_modules/tsx/dist/cli.mjs docs/reviews/2026-09-15-android-sideload-adversarial/probes.mts
```

[probe-results.json](./probe-results.json) is the actual output. [unit-test-compile.log](./unit-test-compile.log) is the actual Gradle failure. [native-apk-permissions.txt](./native-apk-permissions.txt), [capacitor-apk-permissions.txt](./capacitor-apk-permissions.txt), and [native-apk-firebase-providers.txt](./native-apk-firebase-providers.txt) come from `aapt dump` of the locally assembled debug APKs (`org.jacobrakaifoundation.beanstalk`).

Finding 1 is source-plus-platform, not a device trace. Findings 2 and 5 use live service code with deterministic injects; they do not require a reachable production API. Findings 3 and 4 are packaging/source; physical notification delivery was not measured.

The production service, Play enrollment, physical devices, accessibility walkthroughs, and Capacitor WebView `Notification` behavior on API 33+ were not revalidated here.

**First repair:** move `BeanstalkApi.execute()` off the main thread, then confirm native Historical search against openFDA on a device or emulator. Then fix the FCM identifier kind and rotate path before enabling `google-services.json`.
