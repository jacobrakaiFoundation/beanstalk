# Foundation enrollment and fee-waiver checklist

## Status

**Enrolled (checked 2026-09-19 in developer.apple.com/account).** Organization membership for `Jacobrakai Foundation`, Team ID `X5K96H5VRR`, Account Holder Jacob Durham, annual fee waived, renewal 2026-09-15 → 2027-09-15. Program License Agreement (issued 2026-08-18) accepted 2026-09-15. App Store Connect still shows its own Terms of Service prompt on first visit; no app record exists yet.

## Known public identity facts

| Field | Verified value |
| --- | --- |
| Legal entity | `JACOBRAKAI FOUNDATION` |
| Entity type | Washington nonprofit corporation |
| Washington UBI | `605 728 469` |
| Federal status | 501(c)(3) public charity; determination dated 2026-09-03 |
| EIN | `33-3382083` |
| Public website | `https://jacobrakai.org/` |

The public [Foundation About page](https://jacobrakai.org/about/) supports the entity, UBI, federal-status, and website facts; the repository README also records the EIN. Headquarters address, phone, work email, D-U-N-S number, Account Holder identity, and signing authority are intentionally not stored here and must be entered from current private records.

## Organization enrollment

- [ ] Use the Account Holder's legal personal name and an Apple Account with two-factor authentication.
- [ ] Confirm the enrollee has authority to bind `JACOBRAKAI FOUNDATION` or identify an employee who can verify that authority.
- [ ] Use the Foundation's exact legal-entity name, headquarters address, organization-domain work email, phone, and public website; do not use a DBA or GitHub organization name as the legal entity.
- [ ] Look up the Foundation through Apple's D-U-N-S flow before requesting a new number. Verify the D&B record matches the legal name and headquarters address exactly.
- [ ] If absent, request a D-U-N-S number from D&B for free. Apple says to allow up to five business days for issuance and up to two more business days for the record to reach Apple.
- [ ] Start Apple Developer Program enrollment as an **organization** and select the nonprofit fee-waiver option during enrollment.
- [ ] Save the enrollment case/reference number and every Apple request for additional documents outside the public repository.

Apple enrollment requirements: [Program enrollment](https://developer.apple.com/help/account/membership/program-enrollment) and [D-U-N-S Number](https://developer.apple.com/help/account/membership/D-U-N-S).

## Fee-waiver gate

- [ ] Confirm the Foundation remains a qualifying legal nonprofit entity and have current nonprofit documentation ready if Apple requests it.
- [ ] Confirm the account has not signed the Paid Applications Agreement and the Foundation does not sell digital goods or services through its apps.
- [ ] Keep Beanstalk free with no in-app purchases, subscriptions, paid features, or donation-linked benefits.
- [ ] Submit the waiver request before paying. Apple provides no partial or retroactive refund for a membership fee already paid.
- [ ] Wait for written approval; do not treat submission, an enrollment screen, or a support case as approval.
- [ ] At annual renewal, the Account Holder must reconfirm eligibility. If eligibility ends, Apple may restore the annual fee.

Apple's current requirements and renewal rules: [Apple Developer Program fee waiver](https://developer.apple.com/help/account/membership/fee-waivers).

## Donation boundary

Beanstalk's Settings link should open the Foundation's donation page in the user's external browser:

`https://jacobrakai.org/donate/`

That page explains how funds are used and routes a willing donor to the verified Stripe payment flow. The donation is optional, is completed outside the app, and unlocks nothing. Keep the app free. Apple's guidelines allow apps seeking charitable donations outside the app, such as through Safari; direct in-app fundraising requires Apple nonprofit approval, Apple Pay support, use-of-funds disclosures, lawful receipts, and any information App Review requests. The fee waiver and nonprofit fundraising approval are separate decisions. See [App Review Guidelines 3.2.1(vi) and 3.2.2(iv)](https://developer.apple.com/app-store/review/guidelines/#business).
