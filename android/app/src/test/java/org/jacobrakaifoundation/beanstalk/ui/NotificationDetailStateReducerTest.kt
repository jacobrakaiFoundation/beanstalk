package org.jacobrakaifoundation.beanstalk.ui

import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationDetailStateReducerTest {
    private val oldNotice = notice("old")
    private val newNotice = notice("new")

    @Test
    fun `warm notification clears prior detail before loading and after failure`() {
        val warm = BeanstalkUiState(
            selectedNotice = oldNotice,
            selectedMatchTerm = "milk",
            selectedMatchField = "reason",
            selectedOfflineMessage = "old offline copy",
        )

        val loading = NotificationDetailStateReducer.begin(warm)
        assertNull(loading.selectedNotice)
        assertNull(loading.selectedMatchTerm)
        assertNull(loading.selectedMatchField)
        assertNull(loading.selectedOfflineMessage)
        assertTrue(loading.detailLoading)

        val failed = NotificationDetailStateReducer.failure(loading, "unavailable")
        assertNull(failed.selectedNotice)
        assertFalse(failed.detailLoading)
        assertEquals("unavailable", failed.detailError)
    }

    @Test
    fun `warm notification success replaces prior detail`() {
        val loading = NotificationDetailStateReducer.begin(BeanstalkUiState(selectedNotice = oldNotice))
        val loaded = NotificationDetailStateReducer.success(
            current = loading,
            notice = newNotice,
            offlineMessage = null,
            matchTerm = "peanut",
            matchField = "product",
        )

        assertEquals("new", loaded.selectedNotice?.id)
        assertEquals("peanut", loaded.selectedMatchTerm)
        assertFalse(loaded.detailLoading)
        assertEquals(1L, loaded.notificationNavigationVersion)
    }

    private fun notice(id: String) = RecallNotice(
        id = id,
        title = "$id title",
        summary = "summary",
        publicationDate = "20260913",
        retrievedAt = "2026-09-13T20:00:00Z",
        sourceURL = "https://www.fda.gov/$id",
    )
}
