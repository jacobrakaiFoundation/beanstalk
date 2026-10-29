package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import org.jacobrakaifoundation.beanstalk.notifications.NotificationState
import org.jacobrakaifoundation.beanstalk.ui.theme.BeanstalkTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SettingsScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `push off hides notification copy`() {
        setSettings(BeanstalkUiState(notificationState = NotificationState("Coming soon")))
        compose.onAllNodesWithText("Coming soon", substring = true).assertCountEquals(0)
        compose.onAllNodesWithText("Notifications").assertCountEquals(0)
        compose.onAllNodesWithText("Enable alerts").assertCountEquals(0)
        compose.onAllNodesWithText("Turn alerts off").assertCountEquals(0)
        compose.onAllNodesWithText("alert", substring = true, ignoreCase = true).assertCountEquals(0)
        compose.onNodeWithText("This device").assertIsDisplayed()
        compose.onNodeWithText("Clear saved data").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `push on shows notification controls`() {
        setSettings(
            BeanstalkUiState(
                notificationState = NotificationState("Alerts are off.", alertsAvailable = true),
            ),
        )
        compose.onNodeWithText("Notifications").assertIsDisplayed()
        compose.onNodeWithText("Enable alerts").performScrollTo().assertIsDisplayed()
    }

    private fun setSettings(state: BeanstalkUiState) {
        compose.setContent {
            BeanstalkTheme {
                SettingsScreen(
                    state = state,
                    onRequestNotifications = {},
                    onDisableNotifications = {},
                    onClearLocalData = {},
                )
            }
        }
        compose.waitForIdle()
    }
}
