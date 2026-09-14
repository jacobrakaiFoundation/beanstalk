package org.jacobrakaifoundation.beanstalk.data

import kotlinx.coroutines.CancellationException
import org.jacobrakaifoundation.beanstalk.data.model.DeviceCredentials
import org.jacobrakaifoundation.beanstalk.data.network.ApiException

internal data class WatchlistSnapshot(
    val revision: Long,
    val acknowledgedRevision: Long,
    val terms: List<String>,
) {
    val isPending: Boolean get() = revision > acknowledgedRevision
}

/** Uploads coherent snapshots and acknowledges only the revision actually sent. */
internal class WatchlistSyncEngine(
    private val snapshot: suspend () -> WatchlistSnapshot,
    private val markSynced: suspend (Long) -> Unit,
    private val loadCredentials: () -> DeviceCredentials?,
    private val saveCredentials: (DeviceCredentials) -> Unit,
    private val register: suspend (String) -> Pair<String, String>,
    private val update: suspend (DeviceCredentials, List<String>) -> Unit,
) {
    suspend fun syncIfNeeded(): Boolean {
        while (true) {
            val intended = snapshot()
            if (!intended.isPending) return true
            var current = loadCredentials()
            try {
                if (current != null) {
                    try {
                        update(current, intended.terms)
                    } catch (error: ApiException) {
                        if (error.statusCode != 401) throw error
                        val replacement = register(current.pushIdentifier)
                        current = DeviceCredentials(replacement.first, replacement.second, current.pushIdentifier)
                        saveCredentials(current)
                        update(current, intended.terms)
                    }
                }
                // No credentials means no server registration exists. Registration
                // explicitly creates a new pending revision before connecting.
                markSynced(intended.revision)
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                return false
            }
            // A local edit may have committed during upload, including deletion of
            // the final term. Drain it instead of clearing a shared Boolean marker.
        }
    }
}
