package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import org.jacobrakaifoundation.beanstalk.notifications.AlertControlPolicy
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
    fun `enable alerts shows the notification service disclosure`() {
        setSettings(BeanstalkUiState(notificationState = NotificationState("Alerts are off.", alertsAvailable = true)))
        compose.onNodeWithText(AlertControlPolicy.TURNING_ON_ALERTS_DISCLOSURE).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Enable alerts").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `unavailable push hides the disclosure and the enable button`() {
        setSettings(BeanstalkUiState(notificationState = NotificationState("Coming soon")))
        compose.onAllNodesWithText(AlertControlPolicy.TURNING_ON_ALERTS_DISCLOSURE).assertCountEquals(0)
        compose.onAllNodesWithText("Enable alerts").assertCountEquals(0)
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
