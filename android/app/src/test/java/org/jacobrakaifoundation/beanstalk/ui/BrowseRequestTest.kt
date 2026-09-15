package org.jacobrakaifoundation.beanstalk.ui

import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecord
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecordPage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BrowseRequestTest {
    @Test
    fun `draft edits keep latest pagination bound to the submitted query`() {
        val results = BeanstalkUiState(
            query = "milk",
            submittedQuery = "milk",
            archivePage = 1,
            archiveHasMore = true,
        )
        val editing = results.copy(query = "peanut")
        val request = BrowseRequest.from(BrowseRequest.begin(editing, replacing = false), replacing = false)
        assertEquals("milk", request.query)
        assertEquals(2, request.page)
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

    @Test
    fun `latest search uses openFDA page zero without announcement filters`() {
        val editing = BeanstalkUiState(
            mode = BrowseMode.LATEST,
            query = "milk",
            submittedQuery = "",
            classification = "Class I",
            status = "Ongoing",
        )
        val begun = BrowseRequest.begin(editing, replacing = true)
        val request = BrowseRequest.from(begun, replacing = true)
        val search = BrowseRequest.enforcementSearch(begun, request)
        assertEquals("milk", search.query)
        assertEquals("", search.classification)
        assertEquals("", search.status)
        assertEquals(0, search.page)
        assertEquals(BrowseRequest.LATEST_PAGE_SIZE, search.limit)
        assertTrue(search.limit in 20..30)
    }

    @Test
    fun `historical search keeps class and status filters`() {
        val state = BeanstalkUiState(
            mode = BrowseMode.HISTORICAL,
            query = "peanut",
            submittedQuery = "peanut",
            classification = "Class II",
            status = "Terminated",
            archivePage = 2,
            archiveHasMore = true,
        )
        val request = BrowseRequest.from(BrowseRequest.begin(state, replacing = false), replacing = false)
        val search = BrowseRequest.enforcementSearch(state, request)
        assertEquals("peanut", search.query)
        assertEquals("Class II", search.classification)
        assertEquals("Terminated", search.status)
        assertEquals(3, search.page)
        assertEquals(BrowseRequest.HISTORICAL_PAGE_SIZE, search.limit)
    }

    @Test
    fun `latest apply writes openFDA records and preserves load-more paging`() {
        val begun = BrowseRequest.begin(
            BeanstalkUiState(mode = BrowseMode.LATEST, query = "milk", submittedQuery = "milk"),
            replacing = true,
        )
        val request = BrowseRequest.from(begun, replacing = true)
        val first = record("F-001-2026")
        val applied = BrowseRequest.applyEnforcement(
            begun,
            replacing = true,
            page = EnforcementRecordPage(items = listOf(first), total = 40, skip = 0, limit = BrowseRequest.LATEST_PAGE_SIZE),
            request = request,
            offlineMessage = null,
        )
        assertEquals(listOf(first), applied.records)
        assertEquals(0, applied.archivePage)
        assertTrue(applied.archiveHasMore)
        assertFalse(applied.isLoading)

        val moreRequest = BrowseRequest.from(applied, replacing = false)
        val second = record("F-002-2026")
        val paged = BrowseRequest.applyEnforcement(
            applied,
            replacing = false,
            page = EnforcementRecordPage(items = listOf(second), total = 40, skip = BrowseRequest.LATEST_PAGE_SIZE, limit = BrowseRequest.LATEST_PAGE_SIZE),
            request = moreRequest,
            offlineMessage = null,
        )
        assertEquals(listOf(first, second), paged.records)
        assertEquals(1, paged.archivePage)
        assertTrue(paged.archiveHasMore)
    }

    private fun record(id: String) = EnforcementRecord(
        id = id,
        recallNumber = id,
        eventID = "1",
        productDescription = "Milk",
        reasonForRecall = "Listeria",
        classification = "Class I",
        status = "Ongoing",
        distributionPattern = "Nationwide",
        recallingFirm = "Acme",
        city = "Boston",
        state = "MA",
        country = "US",
        publicationDate = "20260915",
        recallInitiationDate = "20260901",
        retrievedAt = "2026-09-15T00:00:00Z",
        productType = "Food",
        codeInfo = "",
        moreCodeInfo = "",
        voluntaryMandated = "Voluntary",
        address1 = "",
        address2 = "",
        postalCode = "",
        centerClassificationDate = "",
        initialFirmNotification = "",
        productQuantity = "",
        terminationDate = "",
    )
}
