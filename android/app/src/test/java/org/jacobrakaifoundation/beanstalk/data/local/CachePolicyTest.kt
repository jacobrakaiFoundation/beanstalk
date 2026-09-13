package org.jacobrakaifoundation.beanstalk.data.local

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CachePolicyTest {
    @Test
    fun `cache remains available through the exact thirty day boundary`() {
        val now = 2_000_000_000_000L
        val storedAt = now - CachePolicy.MAX_AGE_MILLIS

        assertFalse(CachePolicy.isExpired(storedAt, now))
    }

    @Test
    fun `offline cache expires immediately after thirty days`() {
        val now = 2_000_000_000_000L
        val storedAt = now - CachePolicy.MAX_AGE_MILLIS - 1

        assertTrue(CachePolicy.isExpired(storedAt, now))
    }

    @Test
    fun `future timestamps are not treated as expired`() {
        val now = 2_000_000_000_000L

        assertFalse(CachePolicy.isExpired(now + 1_000, now))
    }
}
