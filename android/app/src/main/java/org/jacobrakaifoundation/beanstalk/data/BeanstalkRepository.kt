package org.jacobrakaifoundation.beanstalk.data

import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.jacobrakaifoundation.beanstalk.data.local.LocalStore
import org.jacobrakaifoundation.beanstalk.data.local.DeviceCredentialStore
import org.jacobrakaifoundation.beanstalk.data.model.DeviceCredentials
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecord
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecordPage
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementSearch
import org.jacobrakaifoundation.beanstalk.data.model.LoadedValue
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.data.model.RecallNoticePage
import org.jacobrakaifoundation.beanstalk.data.model.SavedRecall
import org.jacobrakaifoundation.beanstalk.data.model.SavedRecallKind
import org.jacobrakaifoundation.beanstalk.data.model.WatchTerm
import org.jacobrakaifoundation.beanstalk.data.network.ApiException
import org.jacobrakaifoundation.beanstalk.data.network.BeanstalkApi
import org.jacobrakaifoundation.beanstalk.domain.WatchMatcher

class BeanstalkRepository(
    private val local: LocalStore,
    private val api: BeanstalkApi,
    private val credentials: DeviceCredentialStore,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val registrationMutex = Mutex()
    private val watchlistSync = WatchlistSyncEngine(
        snapshot = local::watchlistSnapshot,
        markSynced = local::markWatchlistSynced,
        loadCredentials = credentials::load,
        saveCredentials = credentials::save,
        register = { pushIdentifier ->
            api.registerDevice(pushIdentifier).let { it.deviceId to it.clientSecret }
        },
        update = { current, terms -> api.updateWatchlist(current, terms) },
    )

    suspend fun notices(query: String, cursor: String? = null, limit: Int = 30): LoadedValue<RecallNoticePage> {
        val cacheKey = cacheKey("notices|$query|${cursor ?: "first"}|$limit")
        return loadWithCache(
            cacheKey = cacheKey,
            request = { api.notices(query, cursor, limit) },
            encode = { api.json.encodeToString(it) },
            decode = { api.json.decodeFromString(it) },
            afterNetwork = { page ->
                page.items.forEach { notice ->
                    local.putCache(cacheKey("notice|${notice.id}"), api.json.encodeToString(notice), clock())
                }
            },
        )
    }

    suspend fun notice(id: String): LoadedValue<RecallNotice> = loadWithCache(
        cacheKey = cacheKey("notice|$id"),
        request = { api.notice(id) },
        encode = { api.json.encodeToString(it) },
        decode = { api.json.decodeFromString(it) },
    )

    suspend fun enforcement(search: EnforcementSearch): LoadedValue<EnforcementRecordPage> = loadWithCache(
        cacheKey = cacheKey("openfda|${search.query}|${search.classification}|${search.status}|${search.limit}|${search.page}"),
        request = { api.enforcement(search) },
        encode = { api.json.encodeToString(it) },
        decode = { api.json.decodeFromString(it) },
    )

    suspend fun savedRecalls(): List<SavedRecall> = local.savedRecalls()

    suspend fun save(notice: RecallNotice) {
        local.saveRecall(
            SavedRecall(
                stableID = "notice:${notice.id}",
                kind = SavedRecallKind.NOTICE,
                title = notice.title,
                subtitle = notice.companyName?.takeIf { it.isNotBlank() } ?: "FDA public recall announcement",
                payload = api.json.encodeToString(notice),
                savedAtEpochMillis = clock(),
            ),
        )
    }

    suspend fun save(record: EnforcementRecord) {
        local.saveRecall(
            SavedRecall(
                stableID = "enforcement:${record.id}",
                kind = SavedRecallKind.ENFORCEMENT,
                title = record.productDescription.ifBlank { "Historical enforcement record" },
                subtitle = record.recallingFirm.ifBlank { "As published by openFDA" },
                payload = api.json.encodeToString(record),
                savedAtEpochMillis = clock(),
            ),
        )
    }

    suspend fun removeSaved(stableID: String) = local.removeSavedRecall(stableID)

    fun decodeNotice(item: SavedRecall): RecallNotice? = runCatching {
        api.json.decodeFromString<RecallNotice>(item.payload)
    }.getOrNull()

    fun decodeEnforcement(item: SavedRecall): EnforcementRecord? = runCatching {
        api.json.decodeFromString<EnforcementRecord>(item.payload)
    }.getOrNull()

    suspend fun watchTerms(): List<WatchTerm> = local.watchTerms()

    suspend fun addWatchTerm(rawTerm: String): AddWatchTermResult {
        val normalized = WatchMatcher.normalizeTerm(rawTerm)
        require(normalized.length in 2..80) { "Each term must contain 2–80 characters." }
        val before = local.watchTerms()
        require(before.size < 20) { "A watchlist can contain at most 20 terms." }
        if (before.any { it.normalizedTerm == normalized }) {
            return AddWatchTermResult(added = false, wasFirst = false, message = "That term is already on your watchlist.")
        }
        val added = local.addWatchTerm(WatchTerm(normalized, clock()))
        if (added) syncWatchlistIfRegistered()
        return AddWatchTermResult(added, wasFirst = added && before.isEmpty(), message = null)
    }

    suspend fun removeWatchTerm(term: String) {
        local.removeWatchTerm(term)
        syncWatchlistIfRegistered()
    }

    suspend fun clearUserData() {
        local.clearUserData()
        syncWatchlistIfRegistered()
    }

    fun hasDeviceRegistration(): Boolean = credentials.load() != null

    suspend fun isWatchlistSyncPending(): Boolean = local.isWatchlistSyncPending()

    suspend fun registerPushIdentifier(pushIdentifier: String) = registrationMutex.withLock {
        val terms = local.watchTerms().map { it.normalizedTerm }
        if (terms.isEmpty() && !local.isWatchlistSyncPending()) return@withLock
        local.requireWatchlistSync()
        var current = credentials.load()
        if (current == null) {
            val created = api.registerDevice(pushIdentifier)
            current = DeviceCredentials(created.deviceId, created.clientSecret, pushIdentifier)
            credentials.save(current)
        } else {
            try {
                api.updatePushIdentifier(current, pushIdentifier)
                current = current.copy(pushIdentifier = pushIdentifier)
                credentials.save(current)
            } catch (error: ApiException) {
                if (error.statusCode != 401) throw error
                credentials.clear()
                val created = api.registerDevice(pushIdentifier)
                current = DeviceCredentials(created.deviceId, created.clientSecret, pushIdentifier)
                credentials.save(current)
            }
        }
        check(watchlistSync.syncIfNeeded()) { "Watchlist changes could not be synchronized." }
    }

    suspend fun syncWatchlistIfRegistered(): Boolean = registrationMutex.withLock {
        watchlistSync.syncIfNeeded()
    }

    suspend fun deleteDeviceRegistration() = registrationMutex.withLock {
        val current = credentials.load()
        if (current != null) {
            try {
                api.deleteDevice(current)
            } catch (error: ApiException) {
                if (error.statusCode != 401 && error.statusCode != 404) throw error
            }
        }
        credentials.clear()
    }

    private suspend fun <T> loadWithCache(
        cacheKey: String,
        request: suspend () -> T,
        encode: (T) -> String,
        decode: (String) -> T,
        afterNetwork: suspend (T) -> Unit = {},
    ): LoadedValue<T> {
        return try {
            val result = request()
            val storedAt = clock()
            local.putCache(cacheKey, encode(result), storedAt)
            afterNetwork(result)
            LoadedValue(result, isOfflineCopy = false)
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            val cached = local.cache(cacheKey, clock()) ?: throw error
            val value = runCatching { decode(cached.payload) }.getOrElse { throw error }
            LoadedValue(value, isOfflineCopy = true, cachedAtEpochMillis = cached.storedAtEpochMillis)
        }
    }

    private fun cacheKey(raw: String): String = MessageDigest.getInstance("SHA-256")
        .digest(raw.encodeToByteArray())
        .joinToString("") { "%02x".format(it) }
}

data class AddWatchTermResult(
    val added: Boolean,
    val wasFirst: Boolean,
    val message: String?,
)
