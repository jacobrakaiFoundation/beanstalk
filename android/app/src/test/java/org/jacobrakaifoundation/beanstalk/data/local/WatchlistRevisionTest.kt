package org.jacobrakaifoundation.beanstalk.data.local

import android.app.Application
import android.content.Context
import kotlinx.coroutines.runBlocking
import org.jacobrakaifoundation.beanstalk.data.model.WatchTerm
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [35])
class WatchlistRevisionTest {
    private lateinit var context: Context
    private lateinit var database: BeanstalkDatabase
    private lateinit var local: LocalStore

    @Before
    fun setUp() {
        context = RuntimeEnvironment.getApplication()
        context.deleteDatabase("beanstalk.sqlite")
        database = BeanstalkDatabase(context)
        local = LocalStore(database)
    }

    @After
    fun tearDown() {
        database.close()
        context.deleteDatabase("beanstalk.sqlite")
    }

    @Test
    fun `an old acknowledgement cannot clear a later empty list even after reopening`() = runBlocking {
        local.addWatchTerm(WatchTerm("milk", 1))
        val uploading = local.watchlistSnapshot()
        local.removeWatchTerm("milk")
        local.markWatchlistSynced(uploading.revision)
        database.close()
        database = BeanstalkDatabase(context)
        local = LocalStore(database)
        val pending = local.watchlistSnapshot()
        assertTrue(pending.isPending)
        assertEquals(emptyList<String>(), pending.terms)
        assertTrue(pending.revision > uploading.revision)
        local.markWatchlistSynced(pending.revision)
        assertFalse(local.isWatchlistSyncPending())
        local.markWatchlistSynced(uploading.revision)
        assertFalse(local.isWatchlistSyncPending())
    }

    @Test
    fun `version two pending tombstone migrates without losing retry`() = runBlocking {
        val writable = database.writableDatabase
        writable.execSQL("INSERT INTO sync_state(state_key, state_value) VALUES ('watchlist_sync_pending', 1)")
        writable.version = 2
        database.close()
        database = BeanstalkDatabase(context)
        local = LocalStore(database)
        val migrated = local.watchlistSnapshot()
        assertTrue(migrated.isPending)
        assertEquals(emptyList<String>(), migrated.terms)
        local.markWatchlistSynced(migrated.revision)
        assertFalse(local.isWatchlistSyncPending())
    }

    @Test
    fun `clear and forced registration each preserve a newer durable revision`() = runBlocking {
        local.addWatchTerm(WatchTerm("milk", 1))
        val first = local.watchlistSnapshot()
        local.clearUserData()
        local.requireWatchlistSync()
        local.markWatchlistSynced(first.revision)
        val pending = local.watchlistSnapshot()
        assertTrue(pending.isPending)
        assertEquals(first.revision + 2, pending.revision)
        assertTrue(pending.terms.isEmpty())
    }
}
