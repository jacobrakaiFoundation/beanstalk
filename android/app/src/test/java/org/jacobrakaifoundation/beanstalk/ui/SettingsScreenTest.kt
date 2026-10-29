package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import org.jacobrakaifoundation.beanstalk.notifications.NotificationState
import org.jacobrakaifoundation.beanstalk.ui.theme.BeanstalkTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w480dp-h2000dp")
class SettingsScreenTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `settings shows the unaffiliated disclaimer and medical device line`() {
        setSettings()
        compose.onNodeWithText(
            "Beanstalk is independent and is not affiliated with or endorsed by FDA or USDA FSIS. It is not medical advice.",
        ).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Not a medical device; consult a professional.")
            .performScrollTo()
            .assertIsDisplayed()
    }

    @Test
    fun `privacy support and agency links open the published urls`() {
        val opened = mutableListOf<String>()
        setSettings(uriHandler = RecordingUriHandler(opened))

        clickLink("Privacy policy")
        clickLink("Support")
        clickLink("FDA food recalls")
        clickLink("USDA FSIS recalls")

        assertEquals(
            listOf(
                "https://jacobrakaifoundation.github.io/beanstalk/privacy.html",
                "https://jacobrakaifoundation.github.io/beanstalk/support.html",
                "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts",
                "https://www.fsis.usda.gov/recalls",
            ),
            opened,
        )
    }

    private fun clickLink(label: String) {
        compose.onNodeWithText(label).performScrollTo().assertIsDisplayed().performClick()
    }

    private fun setSettings(uriHandler: UriHandler = RecordingUriHandler(mutableListOf())) {
        compose.setContent {
            CompositionLocalProvider(LocalUriHandler provides uriHandler) {
                BeanstalkTheme {
                    SettingsScreen(
                        state = BeanstalkUiState(
                            notificationState = NotificationState("Alerts are not available on this device."),
                        ),
                        onRequestNotifications = {},
                        onDisableNotifications = {},
                        onClearLocalData = {},
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private class RecordingUriHandler(
        private val opened: MutableList<String>,
    ) : UriHandler {
        override fun openUri(uri: String) {
            opened += uri
        }
    }
}
