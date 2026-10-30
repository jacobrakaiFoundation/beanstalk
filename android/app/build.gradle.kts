plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

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
        unitTests.all { it.useJUnit() }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
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
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
    testImplementation("com.squareup.okhttp3:mockwebserver:5.4.0")
    testImplementation("androidx.compose.ui:ui-test-junit4")
}
