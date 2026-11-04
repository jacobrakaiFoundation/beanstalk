plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest

fun uploadCredential(name: String): String? {
    val fromEnv = System.getenv(name)?.trim()?.takeIf { it.isNotEmpty() }
    if (fromEnv != null) return fromEnv
    return providers.gradleProperty(name).orNull?.trim()?.takeIf { it.isNotEmpty() }
}

val uploadCredentialNames = listOf(
    "ANDROID_UPLOAD_KEYSTORE_PATH",
    "ANDROID_UPLOAD_STORE_PASSWORD",
    "ANDROID_UPLOAD_KEY_ALIAS",
    "ANDROID_UPLOAD_KEY_PASSWORD",
)
val uploadCredentials = uploadCredentialNames.associateWith { uploadCredential(it) }
val presentUploadCredentials = uploadCredentials.values.count { !it.isNullOrEmpty() }
if (presentUploadCredentials != 0 && presentUploadCredentials != uploadCredentials.size) {
    val missing = uploadCredentials.filterValues { it.isNullOrEmpty() }.keys.sorted().joinToString(", ")
    error("Play upload signing needs all four ANDROID_UPLOAD_* values or none. Missing: $missing")
}
val playUploadSigningReady = presentUploadCredentials == uploadCredentials.size
val uploadKeystorePath = uploadCredentials.getValue("ANDROID_UPLOAD_KEYSTORE_PATH")
val uploadStorePassword = uploadCredentials.getValue("ANDROID_UPLOAD_STORE_PASSWORD")
val uploadKeyAlias = uploadCredentials.getValue("ANDROID_UPLOAD_KEY_ALIAS")
val uploadKeyPassword = uploadCredentials.getValue("ANDROID_UPLOAD_KEY_PASSWORD")

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "org.jacobrakaifoundation.beanstalk"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.jacobrakaifoundation.beanstalk"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "BACKEND_BASE_URL", "\"https://api.jacobrakai.org\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        if (playUploadSigningReady) {
            create("playUpload") {
                storeFile = file(requireNotNull(uploadKeystorePath))
                storePassword = requireNotNull(uploadStorePassword)
                keyAlias = requireNotNull(uploadKeyAlias)
                keyPassword = requireNotNull(uploadKeyPassword)
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfigs.findByName("playUpload")?.let { signingConfig = it }
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "/META-INF/DEPENDENCIES",
        )
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.useJUnit()
            // Robolectric must not download android-all at test time (#300).
            // Prefetch before the test task, then force the local directory.
            it.systemProperty(
                "robolectric.dependency.dir",
                layout.buildDirectory.dir("robolectric-offline").get().asFile.absolutePath,
            )
            it.systemProperty("robolectric.offline", "true")
            it.dependsOn("verifyRobolectricOfflineJar")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// SDK 35 only: every Robolectric @Config in this module uses sdk = [35].
// Artifact version from Robolectric 4.16.1 DefaultSdkProvider (V / i7).
val robolectricInstrumentedSdk35 = "15-robolectric-13954326-i7"
// Digest of the resolved jar. Maven Central publishes the same value in
// android-all-instrumented-15-robolectric-13954326-i7.jar.sha256, and the
// paired .sha1 is d684f4e55d30465793a4a9e783f50266097b84df.
val robolectricInstrumentedSdk35Sha256 =
    "06c4c8602d6db7486266a982bc55834ed6dfebd62a0b88daca204139ecf142cb"
val robolectricOfflineJarName = "android-all-instrumented-$robolectricInstrumentedSdk35.jar"
val robolectricOfflineDir = layout.buildDirectory.dir("robolectric-offline")
// Not part of any variant. Release/runtime classpaths do not extend this.
val robolectricOfflineJars by configurations.creating {
    isCanBeConsumed = false
    isCanBeResolved = true
    isVisible = false
    isTransitive = false
}

fun fileSha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
        val buffer = ByteArray(1024 * 1024)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
        }
    }
    return digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte.toInt() and 0xff) }
}

fun downloadRobolectricJar(url: String, destination: File) {
    val connection = URI(url).toURL().openConnection() as HttpURLConnection
    connection.instanceFollowRedirects = true
    connection.connectTimeout = 30_000
    connection.readTimeout = 180_000
    connection.setRequestProperty("Accept", "application/java-archive")
    connection.setRequestProperty("User-Agent", "beanstalk-robolectric-offline")
    val partial = File(destination.parentFile, "${destination.name}.part")
    try {
        val status = connection.responseCode
        if (status == 429 || status == 503) {
            val retryAfter = connection.getHeaderField("Retry-After")?.toLongOrNull()
            throw IOException(
                "HTTP $status${retryAfter?.let { " retry-after=${it}s" } ?: ""}",
            )
        }
        if (status !in 200..299) {
            throw IOException("HTTP $status")
        }
        connection.inputStream.use { input ->
            partial.outputStream().use { output -> input.copyTo(output) }
        }
        val actual = fileSha256(partial)
        if (actual != robolectricInstrumentedSdk35Sha256) {
            partial.delete()
            throw IOException(
                "Robolectric offline jar sha256 mismatch for $robolectricOfflineJarName: " +
                    "expected $robolectricInstrumentedSdk35Sha256 actual $actual",
            )
        }
        if (destination.exists() && !destination.delete()) {
            throw IOException("Could not replace $destination")
        }
        if (!partial.renameTo(destination)) {
            partial.copyTo(destination, overwrite = true)
            partial.delete()
        }
    } finally {
        connection.disconnect()
    }
}

fun fetchRobolectricJarFromMirrors(destination: File) {
    val versionPath =
        "org/robolectric/android-all-instrumented/$robolectricInstrumentedSdk35/$robolectricOfflineJarName"
    val urls = listOf(
        "https://repo1.maven.org/maven2/$versionPath",
        "https://maven-central.storage-download.googleapis.com/maven2/$versionPath",
        "https://repo.maven.apache.org/maven2/$versionPath",
    )
    var lastError = "no attempt"
    for (url in urls) {
        try {
            downloadRobolectricJar(url, destination)
            logger.lifecycle("Robolectric offline jar downloaded from {}", url)
            return
        } catch (failure: Exception) {
            lastError = failure.message ?: failure.toString()
            logger.warn("Robolectric mirror failed ({}): {}", url, lastError)
        }
    }
    error("Could not download $robolectricOfflineJarName. Last error: $lastError")
}

fun requireRobolectricJarSha256(jar: File) {
    if (!jar.isFile) {
        error("Robolectric offline jar missing: ${jar.absolutePath}")
    }
    val actual = fileSha256(jar)
    if (actual != robolectricInstrumentedSdk35Sha256) {
        error(
            "Robolectric offline jar sha256 mismatch for ${jar.name}: " +
                "expected $robolectricInstrumentedSdk35Sha256 actual $actual",
        )
    }
}

val robolectricOfflineJar = robolectricOfflineDir.map { it.file(robolectricOfflineJarName) }

// Download only when the jar is absent. A cache hit skips this task, so it
// does not resolve robolectricOfflineJars or contact Maven. Hash checks for
// both hits and downloads live in verifyRobolectricOfflineJar.
val prepareRobolectricOffline by tasks.registering {
    outputs.file(robolectricOfflineJar)
    onlyIf {
        val jar = robolectricOfflineJar.get().asFile
        if (jar.isFile) {
            logger.lifecycle("Robolectric offline jar present ({}); not downloading", jar.name)
            false
        } else {
            true
        }
    }
    doLast {
        val jar = robolectricOfflineJar.get().asFile
        jar.parentFile.mkdirs()
        val resolved = try {
            robolectricOfflineJars.files.single { it.isFile }
        } catch (failure: Exception) {
            // Maven Central often returns 429 for this large jar on shared CI IPs.
            logger.warn(
                "Gradle could not resolve {} ({}). Trying Maven mirrors.",
                robolectricOfflineJarName,
                failure.message,
            )
            null
        }
        if (resolved != null) {
            val partial = File(jar.parentFile, "${jar.name}.part")
            resolved.copyTo(partial, overwrite = true)
            val actual = fileSha256(partial)
            if (actual != robolectricInstrumentedSdk35Sha256) {
                partial.delete()
                logger.warn(
                    "Resolved Robolectric jar sha256 mismatch: expected {} actual {}",
                    robolectricInstrumentedSdk35Sha256,
                    actual,
                )
                fetchRobolectricJarFromMirrors(jar)
            } else if (!partial.renameTo(jar)) {
                partial.copyTo(jar, overwrite = true)
                partial.delete()
            }
        } else {
            fetchRobolectricJarFromMirrors(jar)
        }
        requireRobolectricJarSha256(jar)
        logger.lifecycle("Robolectric offline jars ready (1): {}", jar.name)
    }
}

// Always runs for unit tests, including when prepareRobolectricOffline is skipped.
val verifyRobolectricOfflineJar by tasks.registering {
    dependsOn(prepareRobolectricOffline)
    doLast {
        val jar = robolectricOfflineJar.get().asFile
        requireRobolectricJarSha256(jar)
        logger.lifecycle(
            "Robolectric offline jar sha256 ok ({}): {}",
            jar.name,
            robolectricInstrumentedSdk35Sha256,
        )
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.06.01")
    val firebaseBom = platform("com.google.firebase:firebase-bom:34.19.0")

    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.navigation:navigation-compose:2.9.8")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    implementation(firebaseBom)
    implementation("com.google.firebase:firebase-messaging")

    implementation("com.squareup.okhttp3:okhttp:5.4.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16.1")
    // Pre-resolved for offline Robolectric (see prepareRobolectricOffline).
    robolectricOfflineJars("org.robolectric:android-all-instrumented:$robolectricInstrumentedSdk35")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:5.4.0")
    testImplementation("androidx.compose.ui:ui-test-junit4")
}
