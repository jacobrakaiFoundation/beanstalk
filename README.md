<p><img src="food-recall-app/public/icon-512.svg" alt="" width="72" height="72"></p>

# Beanstalk

**FDA food recall announcements and historical records, with their limits made clear.**

Beanstalk is a free, accountless public-service project of JACOBRAKAI FOUNDATION. The iPhone app shows recent FDA-published food recall announcements, keeps saved records on the device, supports whole-word and phrase watchlists, and can deliver optional matching notifications. Historical enforcement search remains visibly separate because openFDA is an archive rather than a public-alert feed.

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

## Data and notification boundaries

- **Latest announcements and notifications** come from the FDA Food Safety Recalls RSS feed and its linked public announcements. Existing history is seeded silently.
- **Historical enforcement records** come from openFDA and never create alerts. Publication, initiation, and retrieval dates remain distinct.
- If the short RSS feed loses the previous cursor, delivery pauses while official annual FDA data is reconciled. Annual-only, demo, archived, and stale rows cannot alert.
- Watch terms match Unicode words and phrases without broad negation rules. Queue rows are durable and deduplicated by notice and device.
- The existing web app remains available as a historical browser. Its CAERS Early Signals view is outside the first native iPhone release.

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

The Node 22 service uses Fastify, SQLite, and a persistent delivery queue. APNs is deliberately degraded until all four credentials are supplied outside the repository.

```bash
cd notification-service
cp .env.example .env
npm ci
npm run check
npm run migrate
npm run dev
```

Its production container binds to `127.0.0.1:8787` for an existing HTTPS proxy or tunnel. See [`notification-service/README.md`](notification-service/README.md) for deployment, backup, recovery, health monitoring, and APNs configuration.

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
notification-service/      FDA notice ingestion, device API, SQLite queue, APNs
food-recall-app/            Existing React/PWA historical browser and public pages
docs/app-store/             Enrollment, privacy, metadata, review, and release package
docs/readme/                Date-stamped project screenshots
```

## App Store release state

The repository contains the implementation and a draft release package. Its App Review placeholders, screenshots, public URLs, privacy audit, and generated age rating must be completed from the signed Release build. Apple Developer organization enrollment, fee-waiver approval, APNs provisioning, TestFlight, physical-device verification, App Review submission, and manual publication require current external evidence before they can be marked complete. Start with [`docs/app-store/README.md`](docs/app-store/README.md).

## Support the Foundation

[Donate to JACOBRAKAI FOUNDATION](https://jacobrakai.org/donate/), a 501(c)(3) public charity (legal name JACOBRAKAI FOUNDATION; EIN 33-3382083). Donations are optional and unlock no app feature.
