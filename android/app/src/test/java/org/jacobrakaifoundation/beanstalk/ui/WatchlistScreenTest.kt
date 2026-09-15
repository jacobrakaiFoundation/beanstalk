package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
        compose.setContent {
            BeanstalkTheme {
                WatchlistScreen(
                    state = BeanstalkUiState(),
                    onDismiss = { dismissed += 1 },
                    onAddTerm = { _, _ -> },
                    onRemoveTerm = {},
                    onRequestNotifications = {},
                    onNotice = { _, _, _ -> },
                )
            }
        }
        compose.onNodeWithContentDescription("Close watchlist").assertIsDisplayed().performClick()
        assertEquals(1, dismissed)
    }

    @Test
    fun `term close control removes that term`() {
        var removed: String? = null
        compose.setContent {
            BeanstalkTheme {
                WatchlistScreen(
                    state = BeanstalkUiState(
                        watchTerms = listOf(WatchTerm("milk", 1L)),
                        notificationState = NotificationState("Coming soon"),
                    ),
                    onDismiss = {},
                    onAddTerm = { _, _ -> },
                    onRemoveTerm = { removed = it },
                    onRequestNotifications = {},
                    onNotice = { _, _, _ -> },
                )
            }
        }
        compose.onNodeWithContentDescription("Remove milk").assertIsDisplayed().performClick()
        assertEquals("milk", removed)
    }

    @Test
    fun `coming soon is a banner not a trapping overlay`() {
        compose.setContent {
            BeanstalkTheme {
                WatchlistScreen(
                    state = BeanstalkUiState(notificationState = NotificationState("Coming soon")),
                    onDismiss = {},
                    onAddTerm = { _, _ -> },
                    onRemoveTerm = {},
                    onRequestNotifications = {},
                    onNotice = { _, _, _ -> },
                )
            }
        }
        compose.onNodeWithText("Coming soon").assertIsDisplayed()
        compose.onNodeWithContentDescription("Close watchlist").assertIsDisplayed()
        compose.onNodeWithText("Watching").assertIsDisplayed()
        compose.onNodeWithText("Add a watch term").assertIsDisplayed()
        compose.onNodeWithText("No watch terms yet").assertIsDisplayed()
    }

    @Test
    fun `match rows keep a close path and show evidence`() {
        compose.setContent {
            BeanstalkTheme {
                WatchlistScreen(
                    state = BeanstalkUiState(
                        watchTerms = listOf(WatchTerm("milk", 1L)),
                        watchMatches = listOf(
                            NoticeWatchResult(
                                notice = sampleNotice(),
                                matches = listOf(WatchMatch("milk", "title", "Milk chocolate recalled")),
                            ),
                        ),
                    ),
                    onDismiss = {},
                    onAddTerm = { _, _ -> },
                    onRemoveTerm = {},
                    onRequestNotifications = {},
                    onNotice = { _, _, _ -> },
                )
            }
        }
        compose.onNodeWithContentDescription("Close watchlist").assertIsDisplayed()
        compose.onNodeWithText("Matches in recent announcements").assertIsDisplayed()
        compose.onNodeWithText("“milk” in title").assertIsDisplayed()
        compose.onNodeWithText("Milk chocolate recalled").assertIsDisplayed()
    }

    @Test
    fun `dismiss callback is the only close path required by the screen`() {
        var dismissed = false
        compose.setContent {
            BeanstalkTheme {
                WatchlistScreen(
                    state = BeanstalkUiState(watchTerms = listOf(WatchTerm("peanut", 1L))),
                    onDismiss = { dismissed = true },
                    onAddTerm = { _, _ -> },
                    onRemoveTerm = {},
                    onRequestNotifications = {},
                    onNotice = { _, _, _ -> },
                )
            }
        }
        compose.onNodeWithContentDescription("Close watchlist").performClick()
        assertTrue(dismissed)
        compose.onNodeWithText("Watching").assertIsDisplayed()
        compose.onNodeWithText("peanut").assertIsDisplayed()
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
