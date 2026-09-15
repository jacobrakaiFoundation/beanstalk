package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import org.jacobrakaifoundation.beanstalk.data.model.NoticeWatchResult
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.data.model.WatchMatch
import org.jacobrakaifoundation.beanstalk.data.model.WatchTerm
import org.jacobrakaifoundation.beanstalk.notifications.NotificationState
import org.jacobrakaifoundation.beanstalk.ui.theme.BeanstalkTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class WatchlistScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `close control dismisses the watchlist`() {
        var dismissed = 0
        setWatchlist(onDismiss = { dismissed += 1 })
        compose.onNodeWithContentDescription("Close watchlist").assertIsDisplayed().performClick()
        assertEquals(1, dismissed)
    }

    @Test
    fun `term close control removes that term`() {
        var removed: String? = null
        setWatchlist(
            state = BeanstalkUiState(
                watchTerms = listOf(WatchTerm("milk", 1L)),
                notificationState = NotificationState("Coming soon"),
            ),
            onRemoveTerm = { removed = it },
        )
        compose.onNodeWithContentDescription("Remove milk").performScrollTo().assertIsDisplayed().performClick()
        assertEquals("milk", removed)
    }

    @Test
    fun `coming soon is a banner not a trapping overlay`() {
        setWatchlist(state = BeanstalkUiState(notificationState = NotificationState("Coming soon")))
        compose.onNodeWithText("Coming soon").assertIsDisplayed()
        compose.onNodeWithContentDescription("Close watchlist").assertIsDisplayed()
        compose.onNodeWithText("Watching").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("No watch terms yet").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `match rows keep a close path and show evidence`() {
        setWatchlist(
            state = BeanstalkUiState(
                watchTerms = listOf(WatchTerm("milk", 1L)),
                watchMatches = listOf(
                    NoticeWatchResult(
                        notice = sampleNotice(),
                        matches = listOf(WatchMatch("milk", "title", "Milk chocolate recalled")),
                    ),
                ),
            ),
        )
        compose.onNodeWithContentDescription("Close watchlist").assertIsDisplayed()
        compose.onNodeWithText("Matches in recent announcements").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("“milk” in title").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Milk chocolate recalled").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `dismiss callback is the only close path required by the screen`() {
        var dismissed = false
        setWatchlist(
            state = BeanstalkUiState(watchTerms = listOf(WatchTerm("peanut", 1L))),
            onDismiss = { dismissed = true },
        )
        compose.onNodeWithContentDescription("Close watchlist").performClick()
        assertTrue(dismissed)
        compose.onNodeWithText("Watching").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("peanut").performScrollTo().assertIsDisplayed()
    }

    private fun setWatchlist(
        state: BeanstalkUiState = BeanstalkUiState(),
        onDismiss: () -> Unit = {},
        onRemoveTerm: (String) -> Unit = {},
    ) {
        compose.setContent {
            BeanstalkTheme {
                WatchlistScreen(
                    state = state,
                    onDismiss = onDismiss,
                    onAddTerm = { _, _ -> },
                    onRemoveTerm = onRemoveTerm,
                    onRequestNotifications = {},
                    onNotice = { _, _, _ -> },
                )
            }
        }
        compose.waitForIdle()
    }

    private fun sampleNotice(): RecallNotice = RecallNotice(
        id = "notice-1",
        title = "Milk chocolate recalled",
        summary = "Possible undeclared milk.",
        publicationDate = "20260915",
        retrievedAt = "2026-09-15T00:00:00Z",
        sourceURL = "https://www.fda.gov/example",
    )
}
