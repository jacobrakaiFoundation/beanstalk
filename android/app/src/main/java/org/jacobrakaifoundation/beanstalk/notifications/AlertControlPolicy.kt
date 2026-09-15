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

    fun settingsAction(alertsEnabled: Boolean, alertsAvailable: Boolean): AlertSettingsAction {
        if (alertsEnabled) return AlertSettingsAction.TURN_OFF
        if (alertsAvailable) return AlertSettingsAction.TURN_ON
        return AlertSettingsAction.NONE
    }

    fun shouldOfferEnable(alertsEnabled: Boolean, alertsAvailable: Boolean): Boolean =
        settingsAction(alertsEnabled, alertsAvailable) == AlertSettingsAction.TURN_ON
}
