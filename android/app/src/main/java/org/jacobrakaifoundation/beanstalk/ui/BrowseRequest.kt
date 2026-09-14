package org.jacobrakaifoundation.beanstalk.ui

/** Page positions belong to the submitted search, never to the editable draft. */
internal data class BrowseRequest(val query: String, val cursor: String?, val page: Int) {
    companion object {
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
    }
}
