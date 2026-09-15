package org.jacobrakaifoundation.beanstalk.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlertControlPolicyTest {
    @Test
    fun `enabled alerts always offer turn off even when push is unavailable`() {
        assertEquals(
            AlertSettingsAction.TURN_OFF,
            AlertControlPolicy.settingsAction(alertsEnabled = true, alertsAvailable = false),
        )
        assertEquals(
            AlertSettingsAction.TURN_OFF,
            AlertControlPolicy.settingsAction(alertsEnabled = true, alertsAvailable = true),
        )
    }

    @Test
    fun `unavailable push hides the enable control`() {
        assertEquals(
            AlertSettingsAction.NONE,
            AlertControlPolicy.settingsAction(alertsEnabled = false, alertsAvailable = false),
        )
        assertFalse(AlertControlPolicy.shouldOfferEnable(alertsEnabled = false, alertsAvailable = false))
    }

    @Test
    fun `available push offers enable when alerts are off`() {
        assertEquals(
            AlertSettingsAction.TURN_ON,
            AlertControlPolicy.settingsAction(alertsEnabled = false, alertsAvailable = true),
        )
        assertTrue(AlertControlPolicy.shouldOfferEnable(alertsEnabled = false, alertsAvailable = true))
    }

    @Test
    fun `unavailable copy is user facing not debug jargon`() {
        assertFalse(AlertControlPolicy.UNAVAILABLE_MESSAGE.contains("debug", ignoreCase = true))
        assertFalse(AlertControlPolicy.UNAVAILABLE_MESSAGE.contains("Firebase", ignoreCase = true))
        assertTrue(AlertControlPolicy.UNAVAILABLE_MESSAGE.contains("aren't available", ignoreCase = true))
        assertTrue(AlertControlPolicy.UNAVAILABLE_MESSAGE.contains("Watch terms stay on this device"))
    }
}
