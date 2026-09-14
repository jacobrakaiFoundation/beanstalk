package org.jacobrakaifoundation.beanstalk.ui

import org.junit.Assert.*
import org.junit.Test

class BrowseRequestTest {
    @Test
    fun `draft edits keep latest pagination bound to the submitted query`() {
        val results = BeanstalkUiState(query = "milk", submittedQuery = "milk", nextCursor = "milk-page-2")
        val editing = results.copy(query = "peanut")
        val request = BrowseRequest.from(BrowseRequest.begin(editing, replacing = false), replacing = false)
        assertEquals("milk", request.query)
        assertEquals("milk-page-2", request.cursor)
    }

    @Test
    fun `draft edits do not skip first historical page when submitted`() {
        val editing = BeanstalkUiState(mode = BrowseMode.HISTORICAL, query = "peanut", submittedQuery = "milk", archivePage = 3, archiveHasMore = true)
        val more = BrowseRequest.from(BrowseRequest.begin(editing, false), false)
        assertEquals("milk", more.query)
        assertEquals(4, more.page)
        val submitted = BrowseRequest.begin(editing, true)
        val fresh = BrowseRequest.from(submitted, true)
        assertEquals("peanut", fresh.query)
        assertEquals(0, fresh.page)
        assertNull(fresh.cursor)
        assertFalse(submitted.archiveHasMore)
        assertNull(submitted.nextCursor)
    }
}
