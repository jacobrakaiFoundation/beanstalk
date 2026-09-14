# Beanstalk funding brief

**Help people find and understand public food recall records.**

[Try the web app](https://jacobrakaifoundation.github.io/beanstalk/) · [Contact JACOBRAKAI FOUNDATION](https://jacobrakai.org/about/) · [Support the Foundation](https://jacobrakai.org/donate/)

## The problem and the people

A recall record can contain multiple product names, lot codes, distribution details, and dates. Finding a matching word is only the start: a reader still needs to identify the product and inspect the original source. Beanstalk puts search, filters, and source details in one interface.

The intended users are people checking food products or dietary concerns, community workers helping others find public information, and researchers exploring recall records.

## What exists today

The free, accountless web app searches the openFDA food enforcement archive by product, company, and hazard. It supports state and dietary-term filters, local watchlists, locally cached query results, and source detail views. A separate Early Signals view labels CAERS adverse event reports as unverified.

The repository also contains a native iPhone implementation and a notification service designed around FDA public announcements. That implementation is not evidence of an App Store release or operating production alerts. The [release checklist](app-store/release-checklist.md) tracks the required checks.

Beanstalk is independent of FDA. openFDA enforcement records are an archive, not a live recall-lifecycle or public-alert feed. Empty results do not establish product safety. See the [FDA source and limitations](https://open.fda.gov/apis/food/enforcement/) and [project data boundaries](../README.md#data-and-notification-boundaries).

## Proposed funding priorities

Choose a bounded work package. Scope, cost, timeline, and acceptance criteria would be agreed with the Foundation before a grant is committed; no funding target or delivery date has been set here.

| Work package | Deliverable | Proposed evidence of progress |
| --- | --- | --- |
| **Make recall search easier to use** | Test product search, finding a lot code, and opening the original source with intended users; fix the observed barriers. Include keyboard, screen-reader, enlarged-text, and mobile checks. | Record task completion, time to find the source, and errors before and after fixes. Publish an aggregate findings report and a list of resolved barriers. |
| **Keep source behavior understandable** | Verify missing-data, stale-cache, unavailable-source, and date-label behavior; document recovery and source coverage. | Run a documented set of source-failure scenarios, record which pass, and track unresolved discrepancies and recovery time. |
| **Verify the iPhone release** | Complete signed-device testing, notification opt-in and opt-out checks, privacy review, and the release evidence package. | Record results for closed-app delivery, duplicate suppression, removal of a device, and offline relaunch. Track App Review and publication separately from test results. |

For a funded package, the proposed reporting format is a short progress note with spending against the agreed budget, completed acceptance checks, unresolved issues, and the next milestone. Usage and usability measures would need a documented, privacy-conscious collection method before measurement begins.

## Evidence a funder can inspect

- [Working web application](https://jacobrakaifoundation.github.io/beanstalk/) and [dated demo screenshot](readme/app-demo-20260911.png), with fictional records explicitly labeled.
- [Source and setup instructions](../README.md), [automated check runs](https://github.com/jacobrakaiFoundation/beanstalk/actions/workflows/ci.yml), and [open issues](https://github.com/jacobrakaiFoundation/beanstalk/issues).
- [Privacy policy](https://jacobrakaifoundation.github.io/beanstalk/privacy.html), [support page](https://jacobrakaifoundation.github.io/beanstalk/support.html), and [native release checklist](app-store/release-checklist.md).
- [Foundation identity and contact details](https://jacobrakai.org/about/) and [donation information](https://jacobrakai.org/donate/).

The proposed evaluation starts by establishing a baseline for task completion, source-finding time, and errors. Technical checks document software behavior; health outcomes have not been evaluated in this proposal.

## Discuss a grant or make a gift

**JACOBRAKAI FOUNDATION · EIN 33-3382083.** The [Foundation details page](https://jacobrakai.org/about/) provides public-charity information and a contact route for discussing a Beanstalk-specific scope and budget.

[The existing donation page](https://jacobrakai.org/donate/) accepts gifts to the Foundation. It does not by itself designate a gift for Beanstalk. Beanstalk's features remain free to use, and a donation unlocks nothing.
