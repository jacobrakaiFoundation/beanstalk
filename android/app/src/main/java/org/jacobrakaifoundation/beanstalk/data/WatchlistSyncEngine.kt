package org.jacobrakaifoundation.beanstalk.data

import org.jacobrakaifoundation.beanstalk.data.model.DeviceCredentials
import org.jacobrakaifoundation.beanstalk.data.network.ApiException

/**
 * Drains the durable local watchlist-sync marker. A failed request leaves the
 * marker intact, including when the intended server watchlist is empty.
 */
internal class WatchlistSyncEngine(
    private val isPending: suspend () -> Boolean,
    private val terms: suspend () -> List<String>,
    private val markSynced: suspend () -> Unit,
    private val loadCredentials: () -> DeviceCredentials?,
    private val saveCredentials: (DeviceCredentials) -> Unit,
    private val register: suspend (String) -> Pair<String, String>,
    private val update: suspend (DeviceCredentials, List<String>) -> Unit,
) {
    suspend fun syncIfNeeded(): Boolean {
        if (!isPending()) return true
        var current = loadCredentials()
        if (current == null) {
            // No server registration has ever completed on this installation.
            markSynced()
            return true
        }
        val intendedTerms = terms()
        return try {
            update(current, intendedTerms)
            markSynced()
            true
        } catch (error: ApiException) {
            if (error.statusCode != 401) return false
            try {
                val replacement = register(current.pushIdentifier)
                current = DeviceCredentials(replacement.first, replacement.second, current.pushIdentifier)
                saveCredentials(current)
                update(current, intendedTerms)
                markSynced()
                true
            } catch (_: Exception) {
                false
            }
        } catch (_: Exception) {
            false
        }
    }
}
