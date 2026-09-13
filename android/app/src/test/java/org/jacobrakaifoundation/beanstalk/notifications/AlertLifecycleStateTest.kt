package org.jacobrakaifoundation.beanstalk.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlertLifecycleStateTest {
    @Test
    fun `successful opt out persists across coordinator recreation`() {
        val storage = mutableMapOf<String, Boolean>()
        fun lifecycle() = AlertLifecycleState(
            contains = { "desired" in storage },
            read = { storage.getValue("desired") },
            write = { storage["desired"] = it },
        )

        lifecycle().optIn()
        assertTrue(lifecycle().alertsDesired(hasDeviceRegistration = false))

        lifecycle().optOut()
        assertFalse(lifecycle().alertsDesired(hasDeviceRegistration = true))
        assertEquals(
            AlertLifecycleAction.NONE,
            lifecycle().nextAction(
                hasDeviceRegistration = false,
                hasWatchTerms = true,
                hasNotificationPermission = true,
            ),
        )
    }

    @Test
    fun `failed server deletion retries without silently registering`() {
        var storedDesired: Boolean? = false
        val lifecycle = AlertLifecycleState(
            contains = { storedDesired != null },
            read = { requireNotNull(storedDesired) },
            write = { storedDesired = it },
        )

        val firstAttempt = lifecycle.nextAction(
            hasDeviceRegistration = true,
            hasWatchTerms = true,
            hasNotificationPermission = true,
        )
        // Simulate a failed delete: the device credential remains for the next app open.
        val retry = lifecycle.nextAction(
            hasDeviceRegistration = true,
            hasWatchTerms = true,
            hasNotificationPermission = true,
        )

        assertEquals(AlertLifecycleAction.DELETE_DEVICE, firstAttempt)
        assertEquals(AlertLifecycleAction.DELETE_DEVICE, retry)
    }

    @Test
    fun `existing registration defaults to desired only for upgrades without a saved choice`() {
        val lifecycle = AlertLifecycleState(
            contains = { false },
            read = { error("no stored value") },
            write = {},
        )

        assertEquals(
            AlertLifecycleAction.REGISTER,
            lifecycle.nextAction(
                hasDeviceRegistration = true,
                hasWatchTerms = true,
                hasNotificationPermission = true,
            ),
        )
    }
}
