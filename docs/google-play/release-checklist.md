# Google Play release checklist

## Account and policy

- [ ] The Foundation has a verified full-distribution organization account and permanent package registration.
- [ ] D-U-N-S, payments-profile, legal entity, website, public email, public phone, and authorized representative details match current records.
- [ ] The government-app declaration says unaffiliated; the app and listing show a `.gov` FDA source and non-affiliation statement.
- [ ] Health declaration selects Disease Prevention and Public Health; the listing contains the required medical-device disclaimer and healthcare-professional reminder.
- [ ] Data safety, privacy policy, ads, target audience, content rating, app access, and content-rights answers match the signed bundle.
- [ ] The donation remains a tax-exempt external-browser contribution with no benefit and no Play Billing dependency or permission.

## Build and signing

- [ ] `compileSdk` and `targetSdk` are 36 or newer and still meet the live Play requirement.
- [ ] Release lint, unit tests, and `bundleRelease` pass from a clean checkout using the checked-in Gradle wrapper.
- [ ] Version code is unique and increased; version name, release notes, privacy copy, and server API remain compatible.
- [ ] No Firebase service-account credential, upload keystore, key password, device identifier, or client secret exists in source, bundle resources, logs, screenshots, or CI artifacts.
- [ ] The Foundation upload key signs the AAB; Play App Signing is enabled; both key fingerprints are recorded securely.
- [ ] Restrict the GitHub `google-play` environment to the protected `main` branch, configure required reviewers, and add its six protected secrets: `GOOGLE_SERVICES_JSON_B64`, `ANDROID_UPLOAD_KEYSTORE_B64`, `ANDROID_UPLOAD_STORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD`, and the approved `ANDROID_UPLOAD_CERT_SHA256` fingerprint.
- [ ] Run `Prepare Google Play bundle` from the exact reviewed commit. Verify its Firebase-resource checks, signature check, SHA-256 file, tests, and lint report before downloading the artifact.
- [ ] Play's pre-launch report and app-bundle explorer show no blocking crash, permission, accessibility, or compatibility problem.

## Firebase and service

- [ ] The production Firebase app uses package `org.jacobrakaifoundation.beanstalk` and FID registration.
- [ ] Malachi has the minimum-scope FCM credential mounted read-only; production `/healthz` reports APNs and FCM readiness separately.
- [ ] Monitoring alerts on stale/failed FDA polling, gap pause, oldest queue age, permanent FCM failures, and disabled production push.
- [ ] Physical Android notification, deep link, FID refresh, invalid-FID disablement, retry, opt-out, deletion, and backup-restore quarantine checks pass.
- [ ] Server capacity and isolation are measured with both APNs and FCM workers enabled.

## Store and controlled publication

- [ ] Upload the signed AAB to internal testing first and complete [`review-and-testing.md`](review-and-testing.md).
- [ ] Upload the final icon, feature graphic, screenshots, alt text, listing copy, support URL, and privacy URL; remove all placeholders.
- [ ] Submit the final release for review with managed publishing enabled. Save the review submission, version, and tester evidence.
- [ ] Treat approval as review approval only. Obtain the Foundation account holder's release authorization before making the production change available.
- [ ] After release, verify the public listing, clean install, cold launch, live notices, source links, FID registration, real matching notification, and deletion. Monitor without sending routine user alerts.
