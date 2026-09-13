# App Privacy answers and data contract

## App Store Connect declaration

Answer **Yes, we collect data from this app** because optional alerts retain watch terms and identifiers off device.

| Apple data type | What Beanstalk retains | Purpose | Linked to user | Tracking |
| --- | --- | --- | --- | --- |
| User Content → Other User Content | Watchlist words and phrases | App Functionality | Yes, through the app-specific alert registration; not linked to a name, email, Apple Account, or advertising ID | No |
| Identifiers → Device ID | APNs token unique to this app installation | App Functionality | Yes, to address notifications to the device | No |
| Identifiers → User ID | Random device-registration ID and the one-way hash used to verify its client secret; the full secret remains in iOS Keychain | App Functionality | Yes, to the alert registration only | No |
| Diagnostics → Other Diagnostic Data | Bounded notification delivery records, including attempt time and result | App Functionality | Yes, while tied to the alert registration | No |

Do not declare saved recalls as collected: they remain in SwiftData on the device. Do not declare recall search history if the Foundation does not retain it beyond servicing the request. Re-audit this label against the submitted binary, server, reverse-proxy logs, and every third-party SDK before publishing the answers.

## Required implementation contract

- No account, email address, name, advertising identifier, precise location, contacts, photos, health data, payment data, or analytics profile is collected by the app.
- Saved recalls remain on the device. A user can remove them individually from the Saved tab.
- Alert registration occurs only after the user creates a watchlist and chooses to enable notifications.
- The Foundation backend retains an active device's watch terms, APNs token, random registration ID, and credential-verification hash until the user chooses **Remove this device from Beanstalk alerts** in Settings. Replaced or APNs-invalid registrations become inactive and are deleted automatically within **30 days**, including their watch terms.
- Every notification delivery record, including queued and retrying records, is deleted automatically within **30 days**. These records are used only to operate, secure, and troubleshoot alerts.
- Rotating encrypted backups may retain deleted server records for up to **14 additional days**. Backup access must remain limited to authorized service operators. A restore disables every restored registration and cancels its pending deliveries; alerts resume only after a device with valid credentials explicitly refreshes its current APNs token.
- **Remove this device from Beanstalk alerts** removes the server-side alert registration and clears the local credential. Uninstalling the app alone may not notify the server, so this in-app action must remain available and clear.
- Data is not sold, rented, used for ads, used for marketing, shared with data brokers, or combined with third-party data for tracking.
- The application service disables raw request logging and records route templates rather than URLs, so it does not retain notice-search terms or client IP addresses. Verify the production HTTPS proxy follows the same rule before publishing this declaration.

## Processor and source disclosures

- **Apple Push Notification service:** Apple processes the app-specific device token and notification delivery. Beanstalk sends no alert without permission.
- **FDA/openFDA:** Browsing, searching, and opening source material makes network requests to FDA services. FDA receives normal web-request data under its [website policies](https://www.fda.gov/about-fda/about-website/website-policies). The Foundation does not use those requests to build a search-history profile.
- **Foundation donation page and Stripe:** Tapping Donate opens `https://jacobrakai.org/donate/` in the user's external browser. If the user continues, Stripe hosts the payment flow. No payment information is entered into or received by the app, and donations unlock nothing. The privacy terms on those sites apply.
- **Support:** A user who follows the support route chooses what to disclose through the Foundation's public contact channel. Treat support correspondence under the Foundation's general privacy policy, separate from the app's automated alert data.

## Public privacy URLs

- Privacy Policy: `https://jacobrakaifoundation.github.io/beanstalk/privacy.html`
- Privacy Choices: `https://jacobrakaifoundation.github.io/beanstalk/privacy.html#choices`

Apple defines “collect” as transmitting data off device and retaining it longer than needed for the real-time request. It also requires disclosures for data used only for app functionality. See [App privacy details](https://developer.apple.com/app-store/app-privacy-details/) and [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).
