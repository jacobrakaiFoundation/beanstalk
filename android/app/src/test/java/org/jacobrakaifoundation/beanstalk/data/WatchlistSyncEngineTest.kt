package org.jacobrakaifoundation.beanstalk.data

import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.jacobrakaifoundation.beanstalk.data.model.DeviceCredentials
import org.jacobrakaifoundation.beanstalk.data.network.ApiException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchlistSyncEngineTest {
    @Test
    fun `failed final-term removal stays pending and retries the empty watchlist`() = runTest {
        var pending = true
        var shouldFail = true
        val uploaded = mutableListOf<List<String>>()
        val credentials = DeviceCredentials("device", "secret", "installation-id")
        val engine = WatchlistSyncEngine(
            isPending = { pending },
            terms = { emptyList() },
            markSynced = { pending = false },
            loadCredentials = { credentials },
            saveCredentials = {},
            register = { error("registration should not be replaced") },
            update = { _, terms ->
                uploaded += terms
                if (shouldFail) throw IOException("offline")
            },
        )

        assertFalse(engine.syncIfNeeded())
        assertTrue(pending)
        assertEquals(listOf(emptyList<String>()), uploaded)

        shouldFail = false
        assertTrue(engine.syncIfNeeded())
        assertFalse(pending)
        assertEquals(listOf(emptyList<String>(), emptyList<String>()), uploaded)
    }

    @Test
    fun `clear to empty replaces expired credentials and completes server tombstone`() = runTest {
        var pending = true
        var current = DeviceCredentials("expired", "old-secret", "installation-id")
        val uploaded = mutableListOf<Pair<String, List<String>>>()
        val engine = WatchlistSyncEngine(
            isPending = { pending },
            terms = { emptyList() },
            markSynced = { pending = false },
            loadCredentials = { current },
            saveCredentials = { current = it },
            register = {
                assertEquals("installation-id", it)
                "replacement" to "new-secret"
            },
            update = { credentials, terms ->
                if (credentials.deviceID == "expired") throw ApiException(401, "expired")
                uploaded += credentials.deviceID to terms
            },
        )

        assertTrue(engine.syncIfNeeded())
        assertFalse(pending)
        assertEquals("replacement", current.deviceID)
        assertEquals(listOf("replacement" to emptyList<String>()), uploaded)
    }
}
