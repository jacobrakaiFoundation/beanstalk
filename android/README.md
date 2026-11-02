# Native Android app

Compose sources for the Beanstalk recall client (`applicationId`
`org.jacobrakaifoundation.beanstalk`). This is the Play / native Compose client
started in #144. The Capacitor sideload APK lives in
[`../android-apk`](../android-apk) under a **different** id
(`org.jacobrakaifoundation.beanstalk.sideload`) and is what CI uploads as
`beanstalk-debug-apk`. Identity contract:
[`../shared/contracts/identity.json`](../shared/contracts/identity.json).
Release gates: [`../docs/practices/release.md`](../docs/practices/release.md).

`assembleDebug` uses the Android debug keystore.

```bash
cd android
./gradlew :app:assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Play release bundle

Release minify and resource shrinking are on, so the release build runs R8. Debug builds do not.

`bundleRelease` signs the Android App Bundle when all four upload values are set. Each value is read from the environment first, then from a Gradle property of the same name (`-P`, `~/.gradle/gradle.properties`, or `ORG_GRADLE_PROJECT_<NAME>`). Do not put them in the committed `android/gradle.properties`, and do not commit the keystore (`.jks` and `.keystore` are ignored).

| Name | Meaning |
| --- | --- |
| `ANDROID_UPLOAD_KEYSTORE_PATH` | Absolute path to the upload keystore |
| `ANDROID_UPLOAD_STORE_PASSWORD` | Keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | Key alias |
| `ANDROID_UPLOAD_KEY_PASSWORD` | Key password |

```bash
cd android
./gradlew :app:bundleRelease
```

The signed bundle is `app/build/outputs/bundle/release/app-release.aab`. If none of the four values are set, the bundle is unsigned and Play Console will reject it. If only some are set, configuration fails.
