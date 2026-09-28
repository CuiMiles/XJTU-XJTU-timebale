package io.github.cuimiles.xiaojiao

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class CredentialVaultTest {
    private val zone = ZoneId.of("Asia/Shanghai")

    @Test fun expiresAfterOneCalendarYear() {
        val saved = LocalDate.of(2026, 9, 28).atStartOfDay(zone).toInstant().toEpochMilli()
        val before = LocalDate.of(2027, 9, 27).atStartOfDay(zone).toInstant().toEpochMilli()
        val atYear = LocalDate.of(2027, 9, 28).atStartOfDay(zone).toInstant().toEpochMilli()
        assertFalse(CredentialVault.expired(saved, before))
        assertTrue(CredentialVault.expired(saved, atYear))
    }

    @Test fun rejectsInvalidAndFutureTimestamps() {
        assertTrue(CredentialVault.expired(0, 1000))
        assertTrue(CredentialVault.expired(2000, 1000))
    }
}
