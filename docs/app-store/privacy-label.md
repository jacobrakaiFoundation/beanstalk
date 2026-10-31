# App Privacy answers and data contract

## App Store Connect declaration

Answer **No, we do not collect data from this app.** The iPhone app has no account, no notifications, and no server registration; it transmits nothing off device that the Foundation retains beyond servicing the request.

Do not declare saved recalls or watch terms as collected: both remain in SwiftData on the device, and watchlist matching runs on the device against recent announcements the app has already downloaded. Do not declare recall search history if the Foundation does not retain it beyond servicing the request. Re-audit this label against the submitted binary, server, reverse-proxy logs, and every third-party SDK before publishing the answers. `ios/Resources/PrivacyInfo.xcprivacy` declares no collected data types, and `PrivacyManifestTests` keeps it that way.

## Required implementation contract

- No account, email address, name, device identifier, advertising identifier, precise location, contacts, photos, health data, payment data, or analytics profile is collected by the app.
- Saved recalls and watch terms remain on the device. A user can remove saved recalls individually from the Saved tab, and Settings → Data on this iPhone clears both.
- Recent announcements are fetched from the Foundation backend without any watch term, identifier, or credential; matching happens on the device.
- Data is not sold, rented, used for ads, used for marketing, shared with data brokers, or combined with third-party data for tracking.
- The application service disables raw request logging and records route templates rather than URLs, so it does not retain notice-search terms or client IP addresses. Verify the production HTTPS proxy follows the same rule before publishing this declaration.

## Processor and source disclosures

- **FDA/openFDA:** Browsing, searching, and opening source material makes network requests to FDA services. FDA receives normal web-request data under its [website policies](https://www.fda.gov/about-fda/about-website/website-policies). The Foundation does not use those requests to build a search-history profile.
- **Foundation donation page and Stripe:** Tapping Donate opens `https://jacobrakai.org/donate/` in the user's external browser. If the user continues, Stripe hosts the payment flow. No payment information is entered into or received by the app, and donations unlock nothing. The privacy terms on those sites apply.
- **Support:** A user who follows the support route chooses what to disclose through the Foundation's public contact channel. Treat support correspondence under the Foundation's general privacy policy.

## Public privacy URLs

- Privacy Policy: `https://jacobrakaifoundation.github.io/beanstalk/privacy.html`
- Privacy Choices: `https://jacobrakaifoundation.github.io/beanstalk/privacy.html#choices`

Apple defines “collect” as transmitting data off device and retaining it longer than needed for the real-time request. It also requires disclosures for data used only for app functionality. See [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) and [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).
