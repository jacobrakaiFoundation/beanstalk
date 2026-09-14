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

        val failed = NotificationDetailStateReducer.failure(loading, loading.notificationRequestGeneration, "unavailable")
        assertNull(failed.selectedNotice)
        assertFalse(failed.detailLoading)
        assertEquals("unavailable", failed.detailError)
    }

    @Test
    fun `warm notification success replaces prior detail`() {
        val loading = NotificationDetailStateReducer.begin(BeanstalkUiState(selectedNotice = oldNotice))
        val loaded = NotificationDetailStateReducer.success(
            current = loading,
            requestGeneration = loading.notificationRequestGeneration,
            notice = newNotice,
            offlineMessage = null,
            matchTerm = "peanut",
            matchField = "product",
        )

        assertEquals("new", loaded.selectedNotice?.id)
        assertEquals("peanut", loaded.selectedMatchTerm)
        assertFalse(loaded.detailLoading)
        assertEquals(1L, loaded.pendingNotificationNavigation)
    }

    @Test
    fun `later tap stays selected after earlier success and failure complete`() {
        val first = NotificationDetailStateReducer.begin(BeanstalkUiState())
        val second = NotificationDetailStateReducer.begin(first)
        val latest = NotificationDetailStateReducer.success(second, second.notificationRequestGeneration, newNotice, null, null, null)
        assertEquals(latest, NotificationDetailStateReducer.success(latest, first.notificationRequestGeneration, oldNotice, null, null, null))
        assertEquals(latest, NotificationDetailStateReducer.failure(latest, first.notificationRequestGeneration, "old error"))
    }

    @Test
    fun `opening a normal detail invalidates both pending notification outcomes`() {
        val loading = NotificationDetailStateReducer.begin(BeanstalkUiState())
        val manual = NotificationDetailStateReducer.invalidate(loading).copy(selectedNotice = newNotice)
        assertEquals(manual, NotificationDetailStateReducer.success(manual, loading.notificationRequestGeneration, oldNotice, null, null, null))
        assertEquals(manual, NotificationDetailStateReducer.failure(manual, loading.notificationRequestGeneration, "old error"))
        assertFalse(manual.detailLoading)
    }

    @Test
    fun `consumed navigation is absent on recomposition while a later tap still navigates`() {
        val loading = NotificationDetailStateReducer.begin(BeanstalkUiState())
        val completed = NotificationDetailStateReducer.success(loading, loading.notificationRequestGeneration, newNotice, null, null, null)
        val consumed = NotificationDetailStateReducer.consumeNavigation(completed, completed.pendingNotificationNavigation!!)
        assertNull(consumed.pendingNotificationNavigation)
        val later = NotificationDetailStateReducer.begin(consumed)
        val failed = NotificationDetailStateReducer.failure(later, later.notificationRequestGeneration, "unavailable")
        assertEquals(later.notificationRequestGeneration, failed.pendingNotificationNavigation)
        assertEquals(failed, NotificationDetailStateReducer.consumeNavigation(failed, loading.notificationRequestGeneration))
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
