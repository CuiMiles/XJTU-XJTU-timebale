package io.github.cuimiles.xiaojiao

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FirstOpenReporterTest {
    @Test fun firstOpenIsAttemptedOnceAndOfflineRetryWaitsForNextDay() {
        val first = 1_000_000_000L
        assertTrue(FirstOpenReporter.shouldAttempt(false, 0, first))
        assertFalse(FirstOpenReporter.shouldAttempt(false, first, first + 1000))
        assertTrue(FirstOpenReporter.shouldAttempt(false, first, first + FirstOpenReporter.RETRY_INTERVAL_MS))
        assertFalse(FirstOpenReporter.shouldAttempt(true, first, first + 30 * FirstOpenReporter.RETRY_INTERVAL_MS))
    }
}
