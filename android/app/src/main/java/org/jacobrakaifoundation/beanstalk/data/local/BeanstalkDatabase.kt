package org.jacobrakaifoundation.beanstalk.data.local

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jacobrakaifoundation.beanstalk.data.model.SavedRecall
import org.jacobrakaifoundation.beanstalk.data.model.SavedRecallKind
import org.jacobrakaifoundation.beanstalk.data.model.WatchTerm

data class CacheEntry(val payload: String, val storedAtEpochMillis: Long)

internal object CachePolicy {
    const val MAX_ENTRIES = 200
    const val MAX_AGE_MILLIS = 30L * 24 * 60 * 60 * 1_000

    fun isExpired(storedAtEpochMillis: Long, nowEpochMillis: Long): Boolean =
        storedAtEpochMillis < nowEpochMillis - MAX_AGE_MILLIS
}

class BeanstalkDatabase(context: Context) : SQLiteOpenHelper(
    context.applicationContext,
    DATABASE_NAME,
    null,
    DATABASE_VERSION,
) {
    override fun onConfigure(database: SQLiteDatabase) {
        super.onConfigure(database)
        database.setForeignKeyConstraintsEnabled(true)
        database.enableWriteAheadLogging()
    }

    override fun onCreate(database: SQLiteDatabase) {
        database.execSQL(
            """
            CREATE TABLE saved_recalls (
                stable_id TEXT PRIMARY KEY NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                subtitle TEXT NOT NULL,
                payload TEXT NOT NULL,
                saved_at INTEGER NOT NULL
            )
            """.trimIndent(),
        )
        database.execSQL(
            """
            CREATE TABLE watch_terms (
                term TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
                created_at INTEGER NOT NULL
            )
            """.trimIndent(),
        )
        database.execSQL(
            """
            CREATE TABLE cache_entries (
                cache_key TEXT PRIMARY KEY NOT NULL,
                payload TEXT NOT NULL,
                stored_at INTEGER NOT NULL
            )
            """.trimIndent(),
        )
        database.execSQL(
            """
            CREATE TABLE sync_state (
                state_key TEXT PRIMARY KEY NOT NULL,
                state_value INTEGER NOT NULL
            )
            """.trimIndent(),
        )
        database.execSQL("CREATE INDEX saved_recalls_saved_at ON saved_recalls(saved_at DESC)")
        database.execSQL("CREATE INDEX watch_terms_created_at ON watch_terms(created_at ASC)")
    }

    override fun onUpgrade(database: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            database.execSQL(
                "CREATE TABLE IF NOT EXISTS sync_state (state_key TEXT PRIMARY KEY NOT NULL, state_value INTEGER NOT NULL)",
            )
        }
    }

    override fun onOpen(database: SQLiteDatabase) {
        super.onOpen(database)
        if (!database.isReadOnly) {
            database.delete(
                "cache_entries",
                "stored_at < ?",
                arrayOf((System.currentTimeMillis() - CachePolicy.MAX_AGE_MILLIS).toString()),
            )
        }
    }

    companion object {
        private const val DATABASE_NAME = "beanstalk.sqlite"
        private const val DATABASE_VERSION = 2
    }
}

class LocalStore(private val database: BeanstalkDatabase) {
    suspend fun savedRecalls(): List<SavedRecall> = withContext(Dispatchers.IO) {
        database.readableDatabase.query(
            "saved_recalls",
            arrayOf("stable_id", "kind", "title", "subtitle", "payload", "saved_at"),
            null,
            null,
            null,
            null,
            "saved_at DESC",
        ).use { cursor ->
            buildList {
                while (cursor.moveToNext()) {
                    val kind = runCatching { SavedRecallKind.valueOf(cursor.getString(1)) }.getOrNull()
                        ?: continue
                    add(
                        SavedRecall(
                            stableID = cursor.getString(0),
                            kind = kind,
                            title = cursor.getString(2),
                            subtitle = cursor.getString(3),
                            payload = cursor.getString(4),
                            savedAtEpochMillis = cursor.getLong(5),
                        ),
                    )
                }
            }
        }
    }

    suspend fun saveRecall(item: SavedRecall) = withContext(Dispatchers.IO) {
        val values = ContentValues().apply {
            put("stable_id", item.stableID)
            put("kind", item.kind.name)
            put("title", item.title)
            put("subtitle", item.subtitle)
            put("payload", item.payload)
            put("saved_at", item.savedAtEpochMillis)
        }
        database.writableDatabase.insertWithOnConflict(
            "saved_recalls",
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE,
        )
    }

    suspend fun removeSavedRecall(stableID: String) = withContext(Dispatchers.IO) {
        database.writableDatabase.delete("saved_recalls", "stable_id = ?", arrayOf(stableID))
    }

    suspend fun watchTerms(): List<WatchTerm> = withContext(Dispatchers.IO) {
        database.readableDatabase.query(
            "watch_terms",
            arrayOf("term", "created_at"),
            null,
            null,
            null,
            null,
            "created_at ASC, term ASC",
        ).use { cursor ->
            buildList {
                while (cursor.moveToNext()) add(WatchTerm(cursor.getString(0), cursor.getLong(1)))
            }
        }
    }

    suspend fun addWatchTerm(term: WatchTerm): Boolean = withContext(Dispatchers.IO) {
        val values = ContentValues().apply {
            put("term", term.normalizedTerm)
            put("created_at", term.createdAtEpochMillis)
        }
        val writable = database.writableDatabase
        writable.beginTransaction()
        try {
            val inserted = writable.insertWithOnConflict(
                "watch_terms",
                null,
                values,
                SQLiteDatabase.CONFLICT_IGNORE,
            ) != -1L
            if (inserted) markWatchlistPending(writable)
            writable.setTransactionSuccessful()
            inserted
        } finally {
            writable.endTransaction()
        }
    }

    suspend fun removeWatchTerm(term: String) = withContext(Dispatchers.IO) {
        val writable = database.writableDatabase
        writable.beginTransaction()
        try {
            if (writable.delete("watch_terms", "term = ? COLLATE NOCASE", arrayOf(term)) > 0) {
                markWatchlistPending(writable)
            }
            writable.setTransactionSuccessful()
        } finally {
            writable.endTransaction()
        }
    }

    suspend fun clearUserData() = withContext(Dispatchers.IO) {
        database.writableDatabase.beginTransaction()
        try {
            database.writableDatabase.delete("saved_recalls", null, null)
            database.writableDatabase.delete("watch_terms", null, null)
            database.writableDatabase.delete("cache_entries", null, null)
            markWatchlistPending(database.writableDatabase)
            database.writableDatabase.setTransactionSuccessful()
        } finally {
            database.writableDatabase.endTransaction()
        }
    }

    suspend fun putCache(key: String, payload: String, storedAtEpochMillis: Long) = withContext(Dispatchers.IO) {
        val values = ContentValues().apply {
            put("cache_key", key)
            put("payload", payload)
            put("stored_at", storedAtEpochMillis)
        }
        database.writableDatabase.insertWithOnConflict(
            "cache_entries",
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE,
        )
        database.writableDatabase.delete(
            "cache_entries",
            "stored_at < ?",
            arrayOf((storedAtEpochMillis - CachePolicy.MAX_AGE_MILLIS).toString()),
        )
        database.writableDatabase.execSQL(
            """
            DELETE FROM cache_entries
            WHERE cache_key NOT IN (
                SELECT cache_key FROM cache_entries ORDER BY stored_at DESC LIMIT ${CachePolicy.MAX_ENTRIES}
            )
            """.trimIndent(),
        )
    }

    suspend fun cache(
        key: String,
        nowEpochMillis: Long = System.currentTimeMillis(),
    ): CacheEntry? = withContext(Dispatchers.IO) {
        val entry = database.readableDatabase.query(
            "cache_entries",
            arrayOf("payload", "stored_at"),
            "cache_key = ?",
            arrayOf(key),
            null,
            null,
            null,
            "1",
        ).use { cursor ->
            if (cursor.moveToFirst()) CacheEntry(cursor.getString(0), cursor.getLong(1)) else null
        }
        if (entry != null && CachePolicy.isExpired(entry.storedAtEpochMillis, nowEpochMillis)) {
            database.writableDatabase.delete("cache_entries", "cache_key = ?", arrayOf(key))
            null
        } else {
            entry
        }
    }

    suspend fun isWatchlistSyncPending(): Boolean = withContext(Dispatchers.IO) {
        database.readableDatabase.query(
            "sync_state",
            arrayOf("state_value"),
            "state_key = ?",
            arrayOf(WATCHLIST_PENDING_KEY),
            null,
            null,
            null,
            "1",
        ).use { cursor -> cursor.moveToFirst() && cursor.getInt(0) == 1 }
    }

    suspend fun markWatchlistSynced() = withContext(Dispatchers.IO) {
        database.writableDatabase.delete("sync_state", "state_key = ?", arrayOf(WATCHLIST_PENDING_KEY))
    }

    private fun markWatchlistPending(writable: SQLiteDatabase) {
        val values = ContentValues().apply {
            put("state_key", WATCHLIST_PENDING_KEY)
            put("state_value", 1)
        }
        writable.insertWithOnConflict("sync_state", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private companion object {
        const val WATCHLIST_PENDING_KEY = "watchlist_sync_pending"
    }
}
