# Foundation Play Console organization enrollment

## Status

**Pending.** Repository work does not confirm an account, payment, identity verification, package registration, Firebase project, or signing setup.

## Create the Play account deliberately

Use a **JACOBRAKAI FOUNDATION organization account in Google Play Console**. Google lists a one-time **$25 USD** Play developer registration fee. The official material reviewed for this package does not document a nonprofit fee waiver.

Google also operates a separate Android Developer Console for developers who distribute only outside Google Play. Its no-fee limited plan is capped at 20 devices and does not publish an app on Google Play, so it is not the Beanstalk release path.

[Play Console access terms](https://support.google.com/googleplay/android-developer/answer/14659200) · [Difference from Android Developer Console](https://support.google.com/android-developer-console/answer/16604405)

## Organization verification

- [ ] Use the Foundation's exact legal name and address from its Google payments profile.
- [ ] Supply the matching D-U-N-S number. Google says a new D-U-N-S request can take up to 30 days.
- [ ] Have an authorized representative's current government photo ID and an accepted organization document ready.
- [ ] Use the Foundation website and working organization-domain contact email.
- [ ] Verify the contact and public developer email and phone with Google's one-time codes.
- [ ] Review the information Google will display publicly: legal name, legal address, developer email, and developer phone.
- [ ] Enable two-step verification for the account owner and give each maintainer a separate least-privilege Play Console user.

[Required organization information](https://support.google.com/googleplay/android-developer/answer/13628312) · [U.S. verification documents](https://support.google.com/googleplay/android-developer/answer/15633622)

## App and Firebase setup

- [ ] Register the permanent package name `org.jacobrakaifoundation.beanstalk` in the verified Foundation account.
- [ ] Create a Foundation-owned Firebase project and add that exact Android package.
- [ ] Enable the FCM v1 API and use Firebase Installation ID registration. Do not add Analytics, Crashlytics, AdMob, or BigQuery delivery export for the first release.
- [ ] Store the Firebase server credential outside the repository. On Malachi, mount the credential file read-only and point `GOOGLE_APPLICATION_CREDENTIALS` to it.
- [ ] Create an upload key, store it in the Foundation's protected credential system, and enroll the first bundle in Play App Signing.
- [ ] Record the Play app-signing and upload-key SHA-256 fingerprints outside the public repository.

[FCM Android setup](https://firebase.google.com/docs/cloud-messaging/android/get-started) · [FCM server authorization](https://firebase.google.com/docs/cloud-messaging/send/v1-api)

## Donation boundary

The Settings action opens `https://jacobrakai.org/donate/` in the external browser. The contribution is a tax-exempt donation, provides no digital content or app benefit, and is not processed with Play Billing. Google Play's Payments policy says Play Billing must not be used for tax-exempt donations. Recheck the submitted flow and the current policy before release.

[Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)
