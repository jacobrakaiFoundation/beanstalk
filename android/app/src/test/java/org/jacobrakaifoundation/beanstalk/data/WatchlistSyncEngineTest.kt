package org.jacobrakaifoundation.beanstalk.data

import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
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
            snapshot = { WatchlistSnapshot(1, if (pending) 0 else 1, emptyList()) },
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
            snapshot = { WatchlistSnapshot(1, if (pending) 0 else 1, emptyList()) },
            markSynced = { pending = false },
            loadCredentials = { current },
            saveCredentials = { current = it },
            register = {
                assertEquals("installation-id", it)
                "replacement" to "new-secret"
            },
            update = { credentials, terms ->
                if (credentials.deviceId == "expired") throw ApiException(401, "expired")
                uploaded += credentials.deviceId to terms
            },
        )

        assertTrue(engine.syncIfNeeded())
        assertFalse(pending)
        assertEquals("replacement", current.deviceId)
        assertEquals(listOf("replacement" to emptyList<String>()), uploaded)
    }
    @Test
    fun `removing final term during an upload drains a new empty revision`() = runTest {
        var revision = 1L
        var acknowledged = 0L
        var terms = listOf("milk")
        val uploading = CompletableDeferred<Unit>()
        val finishFirst = CompletableDeferred<Unit>()
        val uploads = mutableListOf<List<String>>()
        val engine = WatchlistSyncEngine(
            snapshot = { WatchlistSnapshot(revision, acknowledged, terms) },
            markSynced = { acknowledged = maxOf(acknowledged, it) },
            loadCredentials = { DeviceCredentials("device", "secret", "installation") },
            saveCredentials = {},
            register = { error("unexpected registration") },
            update = { _, sent ->
                uploads += sent
                if (uploads.size == 1) {
                    uploading.complete(Unit)
                    finishFirst.await()
                }
            },
        )
        val syncing = async { engine.syncIfNeeded() }
        uploading.await()
        terms = emptyList()
        revision++
        finishFirst.complete(Unit)
        assertTrue(syncing.await())
        assertEquals(listOf(listOf("milk"), emptyList<String>()), uploads)
        assertEquals(revision, acknowledged)
    }

    @Test
    fun `failed newer revision stays pending across a fresh sync engine`() = runTest {
        var revision = 1L
        var acknowledged = 0L
        var terms = listOf("milk")
        var fail = true
        val uploads = mutableListOf<List<String>>()
        fun engine() = WatchlistSyncEngine(
            snapshot = { WatchlistSnapshot(revision, acknowledged, terms) },
            markSynced = { acknowledged = maxOf(acknowledged, it) },
            loadCredentials = { DeviceCredentials("device", "secret", "installation") },
            saveCredentials = {},
            register = { error("unexpected registration") },
            update = { _, sent ->
                uploads += sent
                if (sent.isNotEmpty()) {
                    terms = emptyList()
                    revision++
                } else if (fail) throw IOException("offline during final-term removal")
            },
        )
        assertFalse(engine().syncIfNeeded())
        assertEquals(1L, acknowledged)
        assertEquals(2L, revision)
        fail = false
        assertTrue(engine().syncIfNeeded())
        assertEquals(listOf(listOf("milk"), emptyList<String>(), emptyList<String>()), uploads)
        assertEquals(revision, acknowledged)
    }

}
