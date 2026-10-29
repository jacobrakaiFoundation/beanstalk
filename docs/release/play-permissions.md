# Play merged-manifest permissions

This review is for the native Compose app in `android/` (`applicationId`
`org.jacobrakaifoundation.beanstalk`). It is not the Capacitor sideload project
in `android-apk/`.

The list is the release merged manifest from
`:app:processReleaseMainManifest`, after the removals in this change. Library
sources are the manifest merger report for that task. Versions below are the
ones resolved for `releaseRuntimeClasspath` with Firebase BOM `34.19.0`.

## Permissions that remain

| Permission | Merger source | Why it stays | Play declaration |
| --- | --- | --- | --- |
| `android.permission.INTERNET` | App manifest. Also merged from OkHttp 5.4.0, `firebase-installations` 19.1.2, `play-services-cloud-messaging` 17.4.0, and `transport-backend-cct` 3.1.9 | The app calls `https://api.beanstalk.jacobrakai.org` and `https://api.fda.gov` through OkHttp | None. Normal permission |
| `android.permission.POST_NOTIFICATIONS` | App manifest and `firebase-messaging` 25.1.3 | `BeanstalkApp` requests it when the user turns alerts on, and the app posts recall alerts on the `recall_matches` channel | Notifications. See below. Not a location, background-location, or exact-alarm declaration |
| `android.permission.ACCESS_NETWORK_STATE` | `firebase-messaging` 25.1.3, `play-services-cloud-messaging` 17.4.0, `firebase-installations` 19.1.2, `transport-backend-cct` 3.1.9, `transport-runtime` 3.1.9 | Those SDKs are still in the merged manifest (installations registrar, transport scheduler, cloud messaging) and declare this for connectivity checks. App code does not call `ConnectivityManager` | None. Normal permission |
| `org.jacobrakaifoundation.beanstalk.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | `androidx.core:core` 1.18.0, `protectionLevel="signature"` | AndroidX declares this signature permission so the app can send non-exported broadcasts to its own receivers. It is not a user-facing permission | None |

## Removed

These were merged from `firebase-messaging` 25.1.3 and
`play-services-cloud-messaging` 17.4.0, and the release manifest no longer
contains them:

| Permission | Why it was unused |
| --- | --- |
| `android.permission.WAKE_LOCK` | The app does not take a wake lock. The FCM components that do (`FirebaseMessagingService`, `FirebaseInstanceIdReceiver`) are already removed from this manifest because `google-services.json` is absent |
| `com.google.android.c2dm.permission.RECEIVE` | Nothing in the merged manifest receives C2DM messages. The library comment says older Play services builds need it to create instance-ID tokens. This tree removes `FirebaseInitProvider`, so that path does not run |

Both removals are `tools:node="remove"`. The manifest comment says to drop
those removes together with the Firebase component removes if a later build
ships `google-services.json`. Leaving them stripped in that build would break
FCM receive and, on older Play services, token creation.

## Checked and not present

The release merged manifest and the library manifests that contributed to it
do not declare:

- location (`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`)
- exact alarms (`SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`). `transport-runtime` does merge `AlarmManagerSchedulerBroadcastReceiver`, and that merger does not add an exact-alarm permission
- advertising ID (`com.google.android.gms.permission.AD_ID`). `firebase-analytics` is not on `releaseRuntimeClasspath`. `firebase-measurement-connector` 19.0.0 is an API stub and does not add this permission
- foreground service, full-screen intent, notification listener, boot completed, photos, SMS, or call log

No other `uses-permission` entries were in the merged release manifest.

## What to flag in Play Console

Flag `POST_NOTIFICATIONS`. The app asks for it only after the user chooses
Enable alerts, and it uses the permission to post watchlist matches. Google
Play's [permissions policy](https://support.google.com/googleplay/android-developer/answer/9888170)
covers notification access and the other sensitive permissions above.

Do not file a location, background-location, exact-alarm, or advertising-ID
declaration for this manifest. The advertising-ID question should be answered
No unless a later build adds that permission. See [Advertising ID](https://support.google.com/googleplay/android-developer/answer/6048248).
