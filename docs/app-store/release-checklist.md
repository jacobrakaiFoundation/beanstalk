# Manual App Store release checklist

No item in this file is complete until current evidence is attached. Submission and public release are separate actions.

## Before App Store Connect

- [ ] Foundation Apple Developer Program organization enrollment is approved and seller name is `JACOBRAKAI FOUNDATION`.
- [ ] Fee waiver is approved or the Account Holder explicitly chooses how to handle the annual fee; no paid-app agreement is active.
- [ ] Xcode 26 or later and an iOS 26 or later SDK are installed; the Release archive passes tests and contains the final app icon, privacy manifest, APNs entitlement, production endpoints, and no secrets.
- [ ] Production notification service is isolated behind HTTPS, capacity-checked, monitored, and restore-tested; verify all delivery rows and inactive registrations expire within 30 days, the encrypted backup job runs at least daily with 14-day rotation, and neither the service nor HTTPS gateway retains search terms, authorization data, device tokens, or client IP addresses.
- [ ] Set this repository's GitHub Pages source to **GitHub Actions**, publish the merged public pages, and verify the marketing, support, privacy, and privacy-choices URLs return 200 over HTTPS on mobile and desktop.
- [ ] Route `api.jacobrakai.org` (Universal SSL covers one label only; `api.beanstalk.*` fails the TLS handshake) through the managed HTTPS tunnel to the isolated loopback service and verify DNS, TLS, rate limits, and health from outside Malachi.

## App Store Connect

- [ ] Create the app record with the final bundle ID and immutable SKU; set English (U.S.), Reference / Food & Drink, Free, and United States availability.
- [ ] Paste finalized metadata, upload required screenshots, enter content-rights answers, and complete Apple's current age-rating questionnaire from a sample of the signed build's live FDA text; record the generated rating and use the final Foundation review contact in App Store Connect only.
- [ ] Publish the privacy label from `privacy-label.md`; verify it against the shipped binary, server, proxy logs, APNs use, and all SDK privacy manifests.
- [ ] Select **Manually release this version** and confirm no pre-order, in-app purchase, subscription, advertising, or paid agreement is attached.
- [ ] Upload the final build, resolve export-compliance questions, complete TestFlight, and attach the signed test record plus App Review notes.

## Review and manual release

- [ ] Submit to App Review only after the physical-device notification and deletion tests pass.
- [ ] Answer reviewer questions with source-backed behavior; do not promise instant or complete FDA coverage.
- [ ] After approval, verify status is **Pending Developer Release**, recheck production health and public policy pages, then obtain the Account Holder's release authorization.
- [ ] Click **Release This Version** only after that authorization; record timestamp, version/build, approver, and App Store URL.
- [ ] Confirm the public product page, download, cold launch, live data, source links, alert registration, and deletion on a clean iPhone. Monitor polling and APNs failures without sending routine user alerts.

Apple notes that a manually released version may take up to 24 hours to appear. See [manual release options](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/select-an-app-store-version-release-option).
