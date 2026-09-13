<p><img src="food-recall-app/public/icon-512.svg" alt="" width="72" height="72"></p>

# Beanstalk

**FDA food recall announcements and historical records, with their limits made clear.**

Beanstalk is a free, accountless public-service project of JACOBRAKAI FOUNDATION. The native iPhone and Android apps show recent FDA-published food recall announcements, keep saved records on the device, support whole-word and phrase watchlists, and can deliver optional matching notifications. Historical enforcement search remains visibly separate because openFDA is an archive rather than a public-alert feed.

[**Open the web app**](https://jacobrakaifoundation.github.io/beanstalk/) · [Read the privacy policy](https://jacobrakaifoundation.github.io/beanstalk/privacy.html) · [Get support](https://jacobrakaifoundation.github.io/beanstalk/support.html) · [Report a problem](https://github.com/jacobrakaiFoundation/beanstalk/issues)

> Notifications may be delayed or incomplete, and not every recall has a public announcement. A search with no result does not establish that a product is safe. Verify the original FDA notice before acting.

## iPhone app

The native SwiftUI app targets iOS 17 and later. It includes:

- **Recalls:** recent FDA public announcements and a separately labeled openFDA historical search.
- **Saved:** offline SwiftData copies with a reminder that saved records can become outdated.
- **Watchlist:** case-insensitive whole-word and phrase matching with visible match evidence. `salmon` does not match `salmonella`, and `cod` does not match `code`.
- **Settings:** notification controls, privacy and support links, and an optional Foundation donation link that opens in the external browser. Donations unlock nothing.
- Native search, server-side historical filters, pagination, sharing, dark appearance, Dynamic Type, VoiceOver labels, and notification-to-detail routing.

The app stores saved records and watch terms locally. If the user enables alerts, an app-specific APNs token, watch terms, and a random device credential are sent to the Foundation notification service. The credential is kept in the iPhone Keychain.

## Android app

The native Kotlin and Jetpack Compose app targets Android 16/API 36 and supports Android 8 and later. It provides the same four core areas and data boundaries as the iPhone app:

- Material 3 navigation, search, filters, sharing, light/dark appearance, TalkBack labels, and scalable text.
- A private SQLite database for saved recall copies and watch terms, including offline relaunch warnings.
- Firebase Installation ID registration for optional FCM notifications, requested only after the first watch term is created.
- Protected local storage for the random device credential and authenticated watchlist, identifier-rotation, and deletion requests.
- An external-browser donation action. Every feature remains free and donations unlock nothing.

Android notification setup sends the Foundation service a Firebase Installation ID instead of an advertising identifier or Google Account. Firebase Analytics, Crashlytics, AdMob, and cross-app tracking are not included.

## Data and notification boundaries

- **Latest announcements and notifications** come from the FDA Food Safety Recalls RSS feed and its linked public announcements. Existing history is seeded silently.
- **Historical enforcement records** come from openFDA and never create alerts. Publication, initiation, and retrieval dates remain distinct.
- If the short RSS feed loses the previous cursor, delivery pauses while official annual FDA data is reconciled. Annual-only, demo, archived, and stale rows cannot alert.
- Watch terms match Unicode words and phrases without broad negation rules. Queue rows are durable and deduplicated by notice and device.
- The existing web app remains available as a historical browser. Its CAERS Early Signals view is outside the first native mobile releases.

Beanstalk is independent and is not affiliated with or endorsed by FDA. It is not medical advice. For meat, poultry, and processed egg products, also check [USDA FSIS recalls](https://www.fsis.usda.gov/recalls).

## Run the iPhone project

Install the current App Store-supported Xcode and iOS SDK, then open `ios/Beanstalk.xcodeproj`. The project can be regenerated with [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
cd ios
xcodegen generate
open Beanstalk.xcodeproj
```

The portable core package can be checked without launching the app:

```bash
swift test --package-path ios/Core
```

Full simulator, signing, notification, and physical-device checks require Xcode, a Foundation Apple Developer team, and APNs credentials. None are stored in this repository.

## Run the notification service

The Node 22 service uses Fastify, SQLite, and a persistent delivery queue. APNs and FCM report readiness separately and remain disabled until their credentials are supplied outside the repository.

```bash
cd notification-service
cp .env.example .env
npm ci
npm run check
npm run migrate
npm run dev
```

Its production container binds to `127.0.0.1:8787` for an existing HTTPS proxy or tunnel. See [`notification-service/README.md`](notification-service/README.md) for deployment, backup, recovery, monitoring, APNs, and FCM configuration.

## Run the Android project

Install JDK 21 and the Android 16/API 36 SDK, then build with the checked-in wrapper:

```bash
cd android
./gradlew testDebugUnitTest lintRelease bundleRelease
```

The repository intentionally excludes Firebase server credentials, upload keystores, and passwords. A Foundation Firebase app configuration and release upload key are required for production FCM and a signed Play bundle.

## Run the web app

```bash
cd food-recall-app
npm ci
npm run dev
```

For changes, run `npm run check`, `npm run build`, and `npm run test:coverage`. Check live, empty, unavailable, filtered, paginated, keyboard, dark-mode, and small-screen paths.

## Project layout

```text
ios/                       Native SwiftUI app and portable core tests
android/                   Native Kotlin/Compose app and Android unit tests
notification-service/      FDA ingestion, device API, SQLite queue, APNs, and FCM
food-recall-app/            Existing React/PWA historical browser and public pages
docs/app-store/             Enrollment, privacy, metadata, review, and release package
docs/google-play/           Play enrollment, Data safety, metadata, review, and release package
docs/readme/                Date-stamped project screenshots
```

## App Store release state

The repository contains the implementation and a draft release package. Its App Review placeholders, screenshots, public URLs, privacy audit, and generated age rating must be completed from the signed Release build. Apple Developer organization enrollment, fee-waiver approval, APNs provisioning, TestFlight, physical-device verification, App Review submission, and manual publication require current external evidence before they can be marked complete. Start with [`docs/app-store/README.md`](docs/app-store/README.md).

## Google Play release state

The Android implementation and release package are prepared on this branch. Play Console organization enrollment, the one-time registration fee, D-U-N-S verification, Firebase/FCM provisioning, Play App Signing, internal testing, physical-device verification, Play review, and controlled publication remain external gates. Start with [`docs/google-play/README.md`](docs/google-play/README.md).

## Support the Foundation

[Donate to JACOBRAKAI FOUNDATION](https://jacobrakai.org/donate/), a 501(c)(3) public charity (legal name JACOBRAKAI FOUNDATION; EIN 33-3382083). Donations are optional and unlock no app feature.
