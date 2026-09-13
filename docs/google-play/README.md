# Beanstalk Google Play release package

Prepared 2026-09-13 for the first U.S. Android release by **JACOBRAKAI FOUNDATION**.

## Current state

This directory is a draft release package. It does not prove that the Foundation has a verified Play Console organization account, a registered package name, a Firebase project, signing keys, an internal-test release, physical-device evidence, Google Play review approval, or a public release.

## Files

- [`organization-enrollment.md`](organization-enrollment.md) — Foundation account, verification, fee, and package-registration gates.
- [`metadata.md`](metadata.md) — English (U.S.) store copy and policy declarations.
- [`data-safety.md`](data-safety.md) — Data safety working answers and the Android privacy contract.
- [`review-and-testing.md`](review-and-testing.md) — review notes and physical-device/internal-test checks.
- [`screenshots.md`](screenshots.md) — Play icon, feature graphic, and phone screenshot plan.
- [`release-checklist.md`](release-checklist.md) — signing, upload, review, and controlled publication gate.

## Release invariants

- Every feature is free. There are no ads, purchases, subscriptions, or donation-linked benefits.
- The optional donation action opens the Foundation's tax-exempt donation page in the external browser. Google Play Billing is not integrated.
- Recent notices and notifications use FDA-published food recall announcements. Historical openFDA enforcement search remains separately labeled and never creates alerts.
- The app shows its FDA sources and states that it does not represent or receive endorsement from FDA or another government entity.
- The listing states that Beanstalk is not a medical device and reminds users to consult a healthcare professional for medical advice, diagnosis, or treatment.
- Notification permission is requested in context after a user creates a watch term. Browsing remains available after denial.

## Current platform requirements

New Play submissions must target Android 16/API 36 as of August 31, 2026. Publish an Android App Bundle through Play App Signing. Recheck these requirements immediately before upload because Google updates them annually.

- [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- [Create and set up an app](https://support.google.com/googleplay/android-developer/answer/9859152)
