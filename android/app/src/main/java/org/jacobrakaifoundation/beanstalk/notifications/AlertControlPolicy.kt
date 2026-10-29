package org.jacobrakaifoundation.beanstalk.notifications

enum class AlertSettingsAction {
    TURN_ON,
    TURN_OFF,
    NONE,
}

object AlertControlPolicy {
    const val UNAVAILABLE_MESSAGE = "Coming soon"

    const val ENABLE_FAILED_MESSAGE =
        "Beanstalk couldn't turn alerts on. Watch terms stay on this device."

    const val DISABLE_FAILED_MESSAGE =
        "Beanstalk couldn't turn alerts off. Try again."

    const val TURNING_ON_ALERTS_DISCLOSURE =
        "Turning on alerts sends watch terms and the device token to the Jacobrakai Foundation's notification service."

    fun settingsAction(alertsEnabled: Boolean, alertsAvailable: Boolean): AlertSettingsAction {
        if (alertsEnabled) return AlertSettingsAction.TURN_OFF
        if (alertsAvailable) return AlertSettingsAction.TURN_ON
        return AlertSettingsAction.NONE
    }

    fun shouldOfferEnable(alertsEnabled: Boolean, alertsAvailable: Boolean): Boolean =
        settingsAction(alertsEnabled, alertsAvailable) == AlertSettingsAction.TURN_ON

    /** Shown where alerts can be turned on, and only when push is configured. */
    fun turningOnAlertsDisclosure(alertsEnabled: Boolean, alertsAvailable: Boolean): String? =
        if (alertsAvailable && !alertsEnabled) TURNING_ON_ALERTS_DISCLOSURE else null
}
