package org.jacobrakaifoundation.beanstalk.notifications

internal enum class AlertLifecycleAction {
    NONE,
    DELETE_DEVICE,
    WAIT_FOR_PERMISSION,
    REGISTER,
}

/** Keeps the user's alert choice separate from OS permission and server state. */
internal class AlertLifecycleState(
    private val contains: () -> Boolean,
    private val read: () -> Boolean,
    private val write: (Boolean) -> Unit,
) {
    fun alertsDesired(hasDeviceRegistration: Boolean): Boolean =
        if (contains()) read() else hasDeviceRegistration

    fun optIn() = write(true)

    fun optOut() = write(false)

    fun nextAction(
        hasDeviceRegistration: Boolean,
        hasWatchTerms: Boolean,
        hasNotificationPermission: Boolean,
    ): AlertLifecycleAction {
        if (!alertsDesired(hasDeviceRegistration)) {
            return if (hasDeviceRegistration) AlertLifecycleAction.DELETE_DEVICE else AlertLifecycleAction.NONE
        }
        if (!hasWatchTerms) return AlertLifecycleAction.NONE
        if (!hasNotificationPermission) return AlertLifecycleAction.WAIT_FOR_PERMISSION
        return AlertLifecycleAction.REGISTER
    }
}
