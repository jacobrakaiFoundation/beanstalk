package org.jacobrakaifoundation.beanstalk.ui

import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice

internal object NotificationDetailStateReducer {
    fun invalidate(current: BeanstalkUiState): BeanstalkUiState = current.copy(
        notificationRequestGeneration = current.notificationRequestGeneration + 1,
        pendingNotificationNavigation = null,
        detailLoading = false,
    )

    fun begin(current: BeanstalkUiState): BeanstalkUiState = invalidate(current).copy(
        selectedNotice = null,
        selectedRecord = null,
        selectedOfflineMessage = null,
        selectedMatchTerm = null,
        selectedMatchField = null,
        detailLoading = true,
        detailError = null,
    )

    fun success(
        current: BeanstalkUiState,
        requestGeneration: Long,
        notice: RecallNotice,
        offlineMessage: String?,
        matchTerm: String?,
        matchField: String?,
    ): BeanstalkUiState {
        if (requestGeneration != current.notificationRequestGeneration) return current
        return current.copy(
            selectedNotice = notice,
            selectedRecord = null,
            selectedOfflineMessage = offlineMessage,
            selectedMatchTerm = matchTerm,
            selectedMatchField = matchField,
            detailLoading = false,
            detailError = null,
            pendingNotificationNavigation = requestGeneration,
        )
    }

    fun failure(current: BeanstalkUiState, requestGeneration: Long, message: String): BeanstalkUiState {
        if (requestGeneration != current.notificationRequestGeneration) return current
        return current.copy(
            selectedNotice = null,
            selectedRecord = null,
            selectedOfflineMessage = null,
            selectedMatchTerm = null,
            selectedMatchField = null,
            detailLoading = false,
            detailError = message,
            pendingNotificationNavigation = requestGeneration,
        )
    }

    fun consumeNavigation(current: BeanstalkUiState, generation: Long): BeanstalkUiState =
        if (current.pendingNotificationNavigation == generation) current.copy(pendingNotificationNavigation = null)
        else current
}
