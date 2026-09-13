# Beanstalk for Android

The native Android app provides the same four core areas as the iPhone app: current FDA recall announcements, saved offline copies, exact-word and phrase watchlists, and settings. Historical openFDA enforcement snapshots remain visibly separate from current announcements and never generate alerts.

## Build

Use Android Studio with JDK 21 and Android SDK 36, or run the checked-in Gradle wrapper:

```bash
cd android
./gradlew testDebugUnitTest lintDebug assembleDebug
```

The release package is an Android App Bundle:

```bash
./gradlew bundleRelease
```

Release signing is supplied by the Foundation outside this repository. The build does not contain a signing key, Firebase service credential, or Play Console credential.

Ordinary CI compiles an unsigned bundle without Firebase configuration. The manual `Prepare Google Play bundle` workflow is the only repository automation intended to create a signed, Firebase-enabled test-track artifact. It uses the protected `google-play` environment and does not upload to Play.

## Firebase setup

The app builds and all browsing, saving, and local watch matching work without a Firebase file. To enable device alerts, download the Android `google-services.json` for package `org.jacobrakaifoundation.beanstalk` from the Foundation Firebase project and place it at `android/app/google-services.json`. That path is ignored by Git.

FCM auto-init is disabled. The app asks for notification permission only after the first watch term is saved. If permission is granted, Firebase Messaging registers the installation and calls `FirebaseMessagingService.onRegistered(installationId)`. The app sends this Firebase Installation ID to the notification service as:

```json
{
  "provider": "fcm",
  "pushIdentifier": "<Firebase Installation ID>",
  "identifierKind": "fid"
}
```

The returned random device credential is encrypted with an Android Keystore AES-GCM key. Saved records, cached results, and watch terms are stored in the app's private SQLite database. The result cache keeps at most 200 entries and drops entries older than 30 days; “Clear all local Beanstalk data” removes it immediately. Android backup is disabled so credentials and watch terms are not copied through device backup.

## Notification contract

FCM data payloads contain `noticeId` with generic title and body copy. Private watch terms and match fields are not sent through Google. A notification tap is handled from both launch-intent extras and `beanstalk://notice/<noticeId>`, retrieves the announcement, and recomputes visible match evidence against the on-device watchlist. Retrieval falls back to the last successful local copy if the network is unavailable. The manifest opts into the current Firebase Installation ID API and intentionally does not use deprecated registration-token callbacks.

The notification channel identifier is `recall_matches`. Notifications describe matches in published announcements; the app does not promise instant or complete delivery. Firebase, the Foundation service, HTTPS/DNS, a physical Android device, an internal Play test, and Play review must all be verified before release.

## Data and safety boundaries

- Latest notices come from the Foundation service's verified FDA announcement ingestion.
- Historical searches go directly to the openFDA food enforcement endpoint and retain publication, initiation, and retrieval dates separately.
- Searches and filters are sent to the source before pagination. A blank result never implies that a product is safe.
- Watch terms use case-insensitive Unicode whole-word or exact-phrase matching. `salmon` does not match `salmonella`, and `cod` does not match `code`.
- Donations open the Foundation page in the external browser, unlock nothing, and do not alter results or alerts.
- Beanstalk is independent and does not represent FDA, USDA, or the U.S. government. It is not a medical device and does not provide medical advice.
