plugins { id("com.android.application"); kotlin("android"); kotlin("plugin.serialization"); id("org.jetbrains.kotlin.plugin.compose") }
android {
    namespace = "io.github.cuimiles.xiaojiao"
    compileSdk = 36
    defaultConfig {
        applicationId = "io.github.cuimiles.xiaojiao"
        minSdk = 26
        targetSdk = 36
        versionCode = 11
        versionName = "0.8.0-test.2"
    }
    val releaseStore = System.getenv("XIAOJIAO_SIGNING_STORE_FILE")
    if (!releaseStore.isNullOrBlank()) {
        signingConfigs.create("lanRelease") {
            storeFile = file(releaseStore)
            storePassword = System.getenv("XIAOJIAO_SIGNING_STORE_PASSWORD")
            keyAlias = System.getenv("XIAOJIAO_SIGNING_KEY_ALIAS")
            keyPassword = System.getenv("XIAOJIAO_SIGNING_KEY_PASSWORD")
        }
        buildTypes.getByName("release").signingConfig = signingConfigs.getByName("lanRelease")
    }
    buildTypes.getByName("release").apply {
        isMinifyEnabled = true
        isShrinkResources = true
        proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
    buildFeatures { compose = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.06.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core:1.13.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("org.jsoup:jsoup:1.23.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
}
