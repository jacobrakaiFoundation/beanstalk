package org.jacobrakaifoundation.beanstalk.notifications

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import org.jacobrakaifoundation.beanstalk.data.BeanstalkRepository
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class NotificationState(
    val message: String,
    val isWorking: Boolean = false,
    val alertsEnabled: Boolean = false,
    val alertsAvailable: Boolean = false,
)

class NotificationCoordinator(
    private val context: Context,
    private val repository: BeanstalkRepository,
    private val isPushConfigured: () -> Boolean = { FirebaseApp.getApps(context).isNotEmpty() },
    private val requestPushToken: (suspend () -> String)? = null,
) {
    private val mutableState = MutableStateFlow(NotificationState("Checking alert status…", isWorking = true))
    val state: StateFlow<NotificationState> = mutableState.asStateFlow()

    fun permissionDenied() {
        mutableState.value = if (isPushConfigured()) {
            NotificationState(
                "Notification permission was denied. Watch terms stay on this device.",
                alertsAvailable = true,
            )
        } else {
            unavailableState()
        }
    }

    suspend fun synchronize() {
        if (!isPushConfigured()) {
            mutableState.value = unavailableState()
            return
        }
        if (!repository.hasDeviceRegistration()) {
            mutableState.value = NotificationState(
                "Alerts are off. Watch terms stay on this device until you enable notifications.",
                alertsAvailable = true,
            )
            return
        }
        val ok = repository.syncWatchlistIfRegistered()
        mutableState.value = if (ok) {
            NotificationState("Alerts are on for this device.", alertsEnabled = true, alertsAvailable = true)
        } else {
            NotificationState(
                "Watch terms are saved locally. Beanstalk could not reach the alert service.",
                alertsAvailable = true,
            )
        }
    }

    suspend fun enableAlerts() {
        if (!isPushConfigured()) {
            mutableState.value = unavailableState()
            return
        }
        mutableState.value = NotificationState("Turning alerts on…", isWorking = true, alertsAvailable = true)
        try {
            val token = pushToken()
            repository.registerPushIdentifier(token)
            mutableState.value = NotificationState(
                "Alerts are on for this device.",
                alertsEnabled = true,
                alertsAvailable = true,
            )
        } catch (_: Exception) {
            mutableState.value = NotificationState(
                AlertControlPolicy.ENABLE_FAILED_MESSAGE,
                alertsAvailable = true,
            )
        }
    }

    suspend fun disableAlerts() {
        val available = isPushConfigured()
        mutableState.value = NotificationState(
            "Turning alerts off…",
            isWorking = true,
            alertsAvailable = available,
        )
        try {
            repository.deleteDeviceRegistration()
            mutableState.value = if (available) {
                NotificationState("Alerts are off. Watch terms remain on this device.", alertsAvailable = true)
            } else {
                unavailableState()
            }
        } catch (_: Exception) {
            mutableState.value = NotificationState(
                AlertControlPolicy.DISABLE_FAILED_MESSAGE,
                alertsAvailable = available,
            )
        }
    }

    private fun unavailableState() = NotificationState(AlertControlPolicy.UNAVAILABLE_MESSAGE)

    private suspend fun pushToken(): String = requestPushToken?.invoke() ?: firebaseCloudMessagingToken()

    private suspend fun firebaseCloudMessagingToken(): String {
        if (FirebaseApp.getApps(context).isEmpty()) {
            error(AlertControlPolicy.UNAVAILABLE_MESSAGE)
        }
        return suspendCancellableCoroutine { continuation ->
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token -> continuation.resume(token) }
                .addOnFailureListener { error -> continuation.resumeWithException(error) }
        }
    }
}
