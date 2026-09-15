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
)

class NotificationCoordinator(
    private val context: Context,
    private val repository: BeanstalkRepository,
) {
    private val mutableState = MutableStateFlow(NotificationState("Checking alert status…", isWorking = true))
    val state: StateFlow<NotificationState> = mutableState.asStateFlow()

    fun permissionDenied() {
        mutableState.value = NotificationState(
            "Notification permission was denied. Watch terms stay on this device.",
            alertsEnabled = false,
        )
    }

    suspend fun synchronize() {
        if (!repository.hasDeviceRegistration()) {
            mutableState.value = NotificationState(
                "Alerts are off. Watch terms stay on this device until you enable notifications.",
            )
            return
        }
        val ok = repository.syncWatchlistIfRegistered()
        mutableState.value = if (ok) {
            NotificationState("Alerts are on for this device.", alertsEnabled = true)
        } else {
            NotificationState("Watch terms are saved locally. Beanstalk could not reach the alert service.")
        }
    }

    suspend fun enableAlerts() {
        mutableState.value = NotificationState("Turning alerts on…", isWorking = true)
        try {
            val token = firebaseCloudMessagingToken()
            repository.registerPushIdentifier(token)
            mutableState.value = NotificationState("Alerts are on for this device.", alertsEnabled = true)
        } catch (error: Exception) {
            mutableState.value = NotificationState(
                error.message
                    ?: "Push delivery is not configured on this debug build. Watch terms stay on this device.",
            )
        }
    }

    suspend fun disableAlerts() {
        mutableState.value = NotificationState("Turning alerts off…", isWorking = true)
        try {
            repository.deleteDeviceRegistration()
            mutableState.value = NotificationState("Alerts are off. Watch terms remain on this device.")
        } catch (error: Exception) {
            mutableState.value = NotificationState(
                error.message ?: "Beanstalk couldn't turn alerts off. Try again.",
            )
        }
    }

    private suspend fun firebaseCloudMessagingToken(): String {
        if (FirebaseApp.getApps(context).isEmpty()) {
            error("Push delivery is not configured on this debug build. Watch terms stay on this device.")
        }
        return suspendCancellableCoroutine { continuation ->
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token -> continuation.resume(token) }
                .addOnFailureListener { error -> continuation.resumeWithException(error) }
        }
    }
}
