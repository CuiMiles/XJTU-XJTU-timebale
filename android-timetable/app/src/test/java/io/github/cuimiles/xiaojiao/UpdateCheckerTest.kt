package io.github.cuimiles.xiaojiao

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateCheckerTest {
    @Test fun automaticCheckIsOnlyDueAfterSevenDaysOrSourceChange() {
        val source = "http://10.184.17.163:8767/"
        val checkedAt = 1_000_000_000L
        assertTrue(UpdatePolicy.shouldAutoCheck(0, null, source, checkedAt))
        assertFalse(UpdatePolicy.shouldAutoCheck(checkedAt, source, source,
            checkedAt + UpdatePolicy.AUTO_CHECK_INTERVAL_MS - 1))
        assertTrue(UpdatePolicy.shouldAutoCheck(checkedAt, source, source,
            checkedAt + UpdatePolicy.AUTO_CHECK_INTERVAL_MS))
        assertTrue(UpdatePolicy.shouldAutoCheck(checkedAt, source, "http://10.0.0.2:8767/", checkedAt + 1000))
    }

    @Test fun versionComparisonUsesCodeRatherThanDisplayName() {
        val release = UpdateChecker.parse("""{"versionCode":8,"versionName":"0.7.0","apk":"xiaojiao-timetable-0.7.0.apk","sha256":"${"a".repeat(64)}"}""")
        assertEquals(8, release.versionCode)
        assertEquals("0.7.0", release.versionName)
        assertTrue(UpdatePolicy.isNewer(release, 7))
        assertFalse(UpdatePolicy.isNewer(release, 8))
        assertFalse(UpdatePolicy.isNewer(release, 9))
    }

    @Test fun metadataCannotRedirectDownloadToAnotherPathOrHost() {
        assertEquals("http://10.184.17.163:8767/version.json",
            UpdateChecker.endpoint().toString())
        val digest = "a".repeat(64)
        val good = UpdateChecker.parse("""{"versionCode":8,"versionName":"0.7.0","apk":"xiaojiao-timetable-0.7.0.apk","sha256":"$digest"}""")
        assertEquals("http://10.184.17.163:8767/xiaojiao-timetable-0.7.0.apk",
            UpdateChecker.apkUrl(good).toString())
        for (bad in listOf("../../.env", "https://example.com/app.apk", "xiaojiao-timetable-0.6.0.apk")) {
            assertThrows(IllegalArgumentException::class.java) {
                UpdateChecker.parse("""{"versionCode":8,"versionName":"0.7.0","apk":"$bad","sha256":"$digest"}""")
            }
        }
    }

    @Test fun testBuildUsesIndependentMetadataAndRetainsStrictApkValidation() {
        assertEquals("http://10.184.17.163:8767/test/version.json", UpdateChecker.endpoint(true).toString())
        val release = UpdateChecker.parse("""{"versionCode":10,"versionName":"0.8.0-test.1","apk":"xiaojiao-timetable-0.8.0-test.1.apk","sha256":"${"a".repeat(64)}"}""")
        assertEquals("http://10.184.17.163:8767/xiaojiao-timetable-0.8.0-test.1.apk", UpdateChecker.apkUrl(release).toString())
        assertTrue(UpdatePolicy.isNewer(release, 9))
    }
}
