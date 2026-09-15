package org.jacobrakaifoundation.beanstalk.ui

import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecordPage
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementSearch

/** Page positions belong to the submitted search, never to the editable draft. */
internal data class BrowseRequest(val query: String, val cursor: String?, val page: Int) {
    companion object {
        const val LATEST_PAGE_SIZE = 25
        const val HISTORICAL_PAGE_SIZE = 20

        fun from(state: BeanstalkUiState, replacing: Boolean) = BrowseRequest(
            query = state.submittedQuery,
            cursor = if (replacing) null else state.nextCursor,
            page = if (replacing) 0 else state.archivePage + 1,
        )

        fun begin(state: BeanstalkUiState, replacing: Boolean): BeanstalkUiState =
            if (replacing) state.copy(
                submittedQuery = state.query,
                notices = emptyList(),
                records = emptyList(),
                nextCursor = null,
                archivePage = 0,
                archiveHasMore = false,
                isLoading = true,
                errorMessage = null,
                offlineMessage = null,
            ) else state.copy(isLoading = true, errorMessage = null, offlineMessage = null)

        fun enforcementSearch(state: BeanstalkUiState, request: BrowseRequest): EnforcementSearch =
            when (state.mode) {
                BrowseMode.LATEST -> EnforcementSearch(
                    query = request.query,
                    page = request.page,
                    limit = LATEST_PAGE_SIZE,
                )
                BrowseMode.HISTORICAL -> EnforcementSearch(
                    query = request.query,
                    classification = state.classification,
                    status = state.status,
                    page = request.page,
                    limit = HISTORICAL_PAGE_SIZE,
                )
            }

        fun applyEnforcement(
            state: BeanstalkUiState,
            replacing: Boolean,
            page: EnforcementRecordPage,
            request: BrowseRequest,
            offlineMessage: String?,
        ): BeanstalkUiState = state.copy(
            records = if (replacing) page.items else (state.records + page.items).distinctBy { it.id },
            archivePage = request.page,
            archiveHasMore = page.hasMore,
            isLoading = false,
            offlineMessage = offlineMessage,
        )
    }
}
