package org.jacobrakaifoundation.beanstalk.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.jacobrakaifoundation.beanstalk.data.BeanstalkRepository
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecord
import org.jacobrakaifoundation.beanstalk.data.model.NoticeWatchResult
import org.jacobrakaifoundation.beanstalk.data.model.NotificationTarget
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.data.model.SavedRecall
import org.jacobrakaifoundation.beanstalk.data.model.SavedRecallKind
import org.jacobrakaifoundation.beanstalk.data.model.WatchTerm
import org.jacobrakaifoundation.beanstalk.domain.SourceDates
import org.jacobrakaifoundation.beanstalk.domain.WatchMatcher
import org.jacobrakaifoundation.beanstalk.notifications.NotificationCoordinator
import org.jacobrakaifoundation.beanstalk.notifications.NotificationState

enum class BrowseMode(val label: String) { LATEST("Latest"), HISTORICAL("Historical") }

data class BeanstalkUiState(
    val mode: BrowseMode = BrowseMode.LATEST,
    val query: String = "",
    val submittedQuery: String = "",
    val classification: String = "",
    val status: String = "",
    val notices: List<RecallNotice> = emptyList(),
    val records: List<EnforcementRecord> = emptyList(),
    val nextCursor: String? = null,
    val archivePage: Int = 0,
    val archiveHasMore: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val offlineMessage: String? = null,
    val saved: List<SavedRecall> = emptyList(),
    val watchTerms: List<WatchTerm> = emptyList(),
    val watchMatches: List<NoticeWatchResult> = emptyList(),
    val watchMessage: String? = null,
    val watchValidation: String? = null,
    val notificationState: NotificationState = NotificationState("Checking alert status…", isWorking = true),
    val selectedNotice: RecallNotice? = null,
    val selectedRecord: EnforcementRecord? = null,
    val selectedOfflineMessage: String? = null,
    val selectedMatchTerm: String? = null,
    val selectedMatchField: String? = null,
    val detailLoading: Boolean = false,
    val detailError: String? = null,
    val notificationRequestGeneration: Long = 0,
    val pendingNotificationNavigation: Long? = null,
    val localDataMessage: String? = null,
) {
    val savedIDs: Set<String> get() = saved.mapTo(mutableSetOf()) { it.stableID }
}

class BeanstalkViewModel(
    private val repository: BeanstalkRepository,
    private val notifications: NotificationCoordinator,
) : ViewModel() {
    private val mutableState = MutableStateFlow(BeanstalkUiState())
    val state: StateFlow<BeanstalkUiState> = mutableState.asStateFlow()
    private var requestGeneration = 0L
    private var loadJob: Job? = null
    private var detailJob: Job? = null

    init {
        viewModelScope.launch {
            notifications.state.collect { alertState ->
                mutableState.update { it.copy(notificationState = alertState) }
            }
        }
        viewModelScope.launch {
            refreshLocal()
            reload()
            refreshWatchMatches()
            notifications.synchronize()
        }
    }

    fun setMode(mode: BrowseMode) {
        if (mutableState.value.mode == mode) return
        mutableState.update { it.copy(mode = mode, errorMessage = null, offlineMessage = null) }
        reload()
    }

    fun setQuery(query: String) {
        mutableState.update { it.copy(query = query) }
    }

    fun setClassification(classification: String) {
        mutableState.update { it.copy(classification = classification) }
        if (mutableState.value.mode == BrowseMode.HISTORICAL) reload()
    }

    fun setStatus(status: String) {
        mutableState.update { it.copy(status = status) }
        if (mutableState.value.mode == BrowseMode.HISTORICAL) reload()
    }

    fun reload() {
        load(replacing = true)
    }

    fun loadMore() {
        val snapshot = mutableState.value
        if (snapshot.isLoading || !snapshot.archiveHasMore) return
        load(replacing = false)
    }

    private fun load(replacing: Boolean) {
        if (replacing) loadJob?.cancel()
        mutableState.update { BrowseRequest.begin(it, replacing) }
        val captured = mutableState.value
        val request = BrowseRequest.from(captured, replacing)
        val signature = signature(captured)
        val generation = ++requestGeneration
        loadJob = viewModelScope.launch {
            try {
                val loaded = repository.enforcement(BrowseRequest.enforcementSearch(captured, request))
                if (!accepts(generation, signature)) return@launch
                mutableState.update { current ->
                    BrowseRequest.applyEnforcement(
                        current,
                        replacing,
                        loaded.value,
                        request,
                        offlineMessage(loaded.isOfflineCopy, loaded.cachedAtEpochMillis),
                    )
                }
            } catch (error: Exception) {
                if (!accepts(generation, signature)) return@launch
                mutableState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Recall records couldn't be loaded.",
                    )
                }
            }
        }
    }

    fun openNotice(notice: RecallNotice, matchTerm: String? = null, matchField: String? = null) {
        invalidateNotificationRequest()
        mutableState.update {
            it.copy(
                selectedNotice = notice,
                selectedRecord = null,
                selectedOfflineMessage = null,
                selectedMatchTerm = matchTerm,
                selectedMatchField = matchField,
                detailError = null,
            )
        }
    }

    fun openRecord(record: EnforcementRecord) {
        invalidateNotificationRequest()
        mutableState.update {
            it.copy(
                selectedRecord = record,
                selectedNotice = null,
                selectedOfflineMessage = null,
                selectedMatchTerm = null,
                selectedMatchField = null,
                detailError = null,
            )
        }
    }

    fun openSaved(item: SavedRecall): Boolean = when (item.kind) {
        SavedRecallKind.NOTICE -> repository.decodeNotice(item)?.let { openNotice(it); true } ?: false
        SavedRecallKind.ENFORCEMENT -> repository.decodeEnforcement(item)?.let { openRecord(it); true } ?: false
    }

    fun openNotificationTarget(target: NotificationTarget) {
        detailJob?.cancel()
        mutableState.update(NotificationDetailStateReducer::begin)
        val generation = mutableState.value.notificationRequestGeneration
        detailJob = viewModelScope.launch {
            try {
                val loaded = repository.notice(target.noticeID)
                val localMatches = WatchMatcher.matches(
                    repository.watchTerms().map { it.normalizedTerm },
                    loaded.value.searchableFields(),
                )
                val firstLocalMatch = localMatches.firstOrNull()
                mutableState.update { current ->
                    NotificationDetailStateReducer.success(
                        current = current,
                        requestGeneration = generation,
                        notice = loaded.value,
                        offlineMessage = offlineMessage(loaded.isOfflineCopy, loaded.cachedAtEpochMillis),
                        matchTerm = firstLocalMatch?.term,
                        matchField = firstLocalMatch?.field,
                    )
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                mutableState.update { current ->
                    NotificationDetailStateReducer.failure(
                        current,
                        generation,
                        error.message ?: "This recall announcement is unavailable.",
                    )
                }
            }
        }
    }

    private fun invalidateNotificationRequest() {
        detailJob?.cancel()
        mutableState.update(NotificationDetailStateReducer::invalidate)
    }

    fun consumeNotificationNavigation(generation: Long): Boolean {
        // Called on the UI thread immediately before navigation, with no suspension.
        if (mutableState.value.pendingNotificationNavigation != generation) return false
        mutableState.update { NotificationDetailStateReducer.consumeNavigation(it, generation) }
        return true
    }

    fun toggleSaveNotice(notice: RecallNotice) {
        viewModelScope.launch {
            if ("notice:${notice.id}" in mutableState.value.savedIDs) repository.removeSaved("notice:${notice.id}")
            else repository.save(notice)
            refreshSaved()
        }
    }

    fun toggleSaveRecord(record: EnforcementRecord) {
        viewModelScope.launch {
            if ("enforcement:${record.id}" in mutableState.value.savedIDs) repository.removeSaved("enforcement:${record.id}")
            else repository.save(record)
            refreshSaved()
        }
    }

    fun removeSaved(item: SavedRecall) {
        viewModelScope.launch {
            repository.removeSaved(item.stableID)
            refreshSaved()
        }
    }

    fun addWatchTerm(rawTerm: String, onFirstTerm: () -> Unit) {
        viewModelScope.launch {
            try {
                val result = repository.addWatchTerm(rawTerm)
                mutableState.update { it.copy(watchValidation = result.message) }
                refreshWatchTerms()
                refreshWatchMatches()
                if (result.wasFirst) onFirstTerm()
                else notifications.synchronize()
            } catch (error: IllegalArgumentException) {
                mutableState.update { it.copy(watchValidation = error.message) }
            } catch (_: Exception) {
                mutableState.update { it.copy(watchValidation = "Beanstalk couldn't save that watch term. Try again.") }
            }
        }
    }

    fun removeWatchTerm(term: String) {
        viewModelScope.launch {
            try {
                repository.removeWatchTerm(term)
                mutableState.update { it.copy(watchValidation = null) }
                refreshWatchTerms()
                refreshWatchMatches()
                notifications.synchronize()
            } catch (_: Exception) {
                mutableState.update { it.copy(watchValidation = "Beanstalk couldn't remove that watch term. Try again.") }
            }
        }
    }

    fun enableNotifications() {
        viewModelScope.launch { notifications.enableAlerts() }
    }

    fun notificationPermissionDenied() = notifications.permissionDenied()

    fun disableNotifications() {
        viewModelScope.launch { notifications.disableAlerts() }
    }

    fun synchronizeNotifications() {
        viewModelScope.launch { notifications.synchronize() }
    }

    fun clearLocalData() {
        viewModelScope.launch {
            try {
                repository.clearUserData()
                refreshLocal()
                notifications.synchronize()
                mutableState.update { it.copy(localDataMessage = "Saved recalls, watch terms, and cached results were cleared from this device.") }
            } catch (_: Exception) {
                mutableState.update { it.copy(localDataMessage = "Beanstalk couldn't clear the saved data. Try again.") }
            }
        }
    }

    private suspend fun refreshLocal() {
        refreshSaved()
        refreshWatchTerms()
    }

    private suspend fun refreshSaved() {
        mutableState.update { it.copy(saved = repository.savedRecalls()) }
    }

    private suspend fun refreshWatchTerms() {
        mutableState.update { it.copy(watchTerms = repository.watchTerms()) }
    }

    private suspend fun refreshWatchMatches() {
        val terms = repository.watchTerms().map { it.normalizedTerm }
        if (terms.isEmpty()) {
            mutableState.update { it.copy(watchMatches = emptyList(), watchMessage = null) }
            return
        }
        try {
            val loaded = repository.notices(query = "", limit = 100)
            val matches = loaded.value.items.mapNotNull { notice ->
                WatchMatcher.matches(terms, notice.searchableFields())
                    .takeIf { it.isNotEmpty() }
                    ?.let { NoticeWatchResult(notice, it) }
            }
            mutableState.update {
                it.copy(
                    watchMatches = matches,
                    watchMessage = offlineMessage(loaded.isOfflineCopy, loaded.cachedAtEpochMillis),
                )
            }
        } catch (_: Exception) {
            mutableState.update {
                it.copy(
                    watchMatches = emptyList(),
                    watchMessage = "Recent announcements couldn't be checked. Your saved watch terms remain on this device.",
                )
            }
        }
    }

    private fun signature(state: BeanstalkUiState): String = listOf(
        state.mode.name,
        state.submittedQuery,
        state.classification,
        state.status,
    ).joinToString("|")

    private fun accepts(generation: Long, capturedSignature: String): Boolean =
        generation == requestGeneration && signature(mutableState.value) == capturedSignature

    private fun offlineMessage(isOffline: Boolean, cachedAt: Long?): String? {
        if (!isOffline) return null
        val date = cachedAt?.let(SourceDates::displayEpoch) ?: "an earlier session"
        return "Live retrieval failed. Showing the last successful copy from $date."
    }

    class Factory(
        private val repository: BeanstalkRepository,
        private val notifications: NotificationCoordinator,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(BeanstalkViewModel::class.java))
            return BeanstalkViewModel(repository, notifications) as T
        }
    }
}
