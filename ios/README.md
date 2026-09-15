# Native iPhone app

SwiftUI client and portable core package for Beanstalk recall search, saved records, watchlists, and optional push alerts. **Minimum deployment target is iOS 17** (`deploymentTarget` in `project.yml`).

## Open in Xcode

Install a current App Store-supported Xcode (CI requires **Xcode 26+** for Release builds). Regenerate the project with [XcodeGen](https://github.com/yonaskolb/XcodeGen), then open the workspace project:

```bash
cd ios
xcodegen generate
open Beanstalk.xcodeproj
```

Simulator runs, signing, notification opt-in, and physical-device checks need a Foundation Apple Developer team and credentials that are not stored in this repository.

## Test the core package

Shared parsing, matching, and API logic lives in `Core/` and can be checked without launching the app:

```bash
swift test --package-path ios/Core
```

## Release and store package

App Store enrollment, privacy, metadata, review notes, and the manual release checklist live under [`docs/app-store/README.md`](../docs/app-store/README.md). For a repo-level overview of features and boundaries, see the [iPhone app section](../README.md#iphone-app) in the root README.
