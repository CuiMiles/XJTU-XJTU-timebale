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
        val release = UpdateChecker.parse("""{"versionCode":7,"versionName":"0.6.0"}""")
        assertEquals(7, release.versionCode)
        assertEquals("0.6.0", release.versionName)
        assertTrue(UpdatePolicy.isNewer(release, 6))
        assertFalse(UpdatePolicy.isNewer(release, 7))
        assertFalse(UpdatePolicy.isNewer(release, 8))
    }

    @Test fun endpointUsesSameServerAndRejectsEmbeddedCredentials() {
        assertEquals("http://10.184.17.163:8767/version.json",
            UpdateChecker.endpoint("http://10.184.17.163:8767/download").toString())
        assertThrows(IllegalArgumentException::class.java) {
            UpdateChecker.endpoint("http://user:password@10.184.17.163:8767/")
        }
        assertThrows(IllegalArgumentException::class.java) { UpdateChecker.endpoint("file:///tmp/version.json") }
        assertThrows(IllegalArgumentException::class.java) { UpdateChecker.parse("""{"versionCode":0,"versionName":"0.6.0"}""") }
    }
}
