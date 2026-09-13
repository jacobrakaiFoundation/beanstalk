package org.jacobrakaifoundation.beanstalk.notifications

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import org.jacobrakaifoundation.beanstalk.data.BeanstalkRepository

data class NotificationState(
    val message: String,
    val alertsEnabled: Boolean = false,
    val isWorking: Boolean = false,
)

class NotificationCoordinator(
    private val context: Context,
    private val repository: BeanstalkRepository,
) {
    private val preferences = context.getSharedPreferences("notification_preferences", Context.MODE_PRIVATE)
    private val lifecycle = AlertLifecycleState(
        contains = { preferences.contains(ALERTS_DESIRED) },
        read = { preferences.getBoolean(ALERTS_DESIRED, false) },
        write = ::storeAlertsDesired,
    )
    private val mutableState = MutableStateFlow(
        NotificationState("Add a watch term to turn on optional matching alerts."),
    )
    val state: StateFlow<NotificationState> = mutableState.asStateFlow()

    suspend fun synchronize() {
        val terms = repository.watchTerms()
        val registered = repository.hasDeviceRegistration()
        when (lifecycle.nextAction(registered, terms.isNotEmpty(), hasNotificationPermission())) {
            AlertLifecycleAction.DELETE_DEVICE -> {
                performOptOut()
                return
            }
            AlertLifecycleAction.NONE -> {
                if (registered) {
                    val synced = repository.syncWatchlistIfRegistered()
                    mutableState.value = if (synced) {
                        NotificationState(
                            "This device remains registered for alerts, but it has no watch terms. You can remove the device registration in Settings.",
                            alertsEnabled = true,
                        )
                    } else {
                        NotificationState(
                            "The watchlist was cleared on this device, but the server update is waiting for a connection. Beanstalk will retry when the app opens.",
                            alertsEnabled = true,
                        )
                    }
                } else {
                    mutableState.value = NotificationState("Add a watch term to turn on optional matching alerts.")
                }
                return
            }
            AlertLifecycleAction.WAIT_FOR_PERMISSION -> {
                NotificationState(
                    "Notifications are off. Your watchlist still works in the app.",
                    alertsEnabled = registered,
                )
                    .also { mutableState.value = it }
                return
            }
            AlertLifecycleAction.REGISTER -> {
                repository.syncWatchlistIfRegistered()
                registerWithFirebase()
            }
        }
    }

    suspend fun enableAlerts() {
        if (!hasNotificationPermission()) {
            mutableState.value = NotificationState("Notifications are off. Your watchlist still works in the app.")
            return
        }
        lifecycle.optIn()
        registerWithFirebase()
    }

    suspend fun onRegistered(installationID: String) {
        if (!lifecycle.alertsDesired(repository.hasDeviceRegistration())) {
            runCatching { firebaseMessagingOrNull()?.unregister()?.awaitUnit() }
            mutableState.value = NotificationState("Alerts are off. Your watchlist remains on this device.")
            return
        }
        mutableState.value = NotificationState("Connecting this watchlist…", isWorking = true)
        try {
            repository.registerPushIdentifier(installationID)
            mutableState.value = NotificationState(
                "Alerts are on for this watchlist. Delivery can be delayed or incomplete.",
                alertsEnabled = true,
            )
        } catch (_: Exception) {
            mutableState.value = NotificationState(
                "Beanstalk couldn't finish alert setup. It will retry when the app opens.",
                alertsEnabled = repository.hasDeviceRegistration(),
            )
        }
    }

    suspend fun disableAlerts() {
        lifecycle.optOut()
        performOptOut()
    }

    private suspend fun performOptOut() {
        mutableState.value = NotificationState("Removing this device from alerts…", isWorking = true)
        val serverResult = runCatching { repository.deleteDeviceRegistration() }
        val firebaseResult = runCatching { firebaseMessagingOrNull()?.unregister()?.awaitUnit() }
        if (serverResult.isSuccess && firebaseResult.isSuccess) {
            mutableState.value = NotificationState("Alerts are off. Your watchlist remains on this device.")
        } else {
            mutableState.value = NotificationState(
                "Alert removal is still pending. Beanstalk will retry the server deletion when the app opens.",
                alertsEnabled = repository.hasDeviceRegistration(),
            )
        }
    }

    suspend fun onDeletedMessages() {
        mutableState.value = NotificationState(
            "Firebase dropped pending messages. Refreshing current announcements…",
            alertsEnabled = repository.hasDeviceRegistration(),
            isWorking = true,
        )
        val result = runCatching { repository.notices(query = "", limit = 100) }
        mutableState.value = if (result.getOrNull()?.isOfflineCopy == false) {
            NotificationState(
                "Current announcements were refreshed. Alerts can still be delayed or incomplete.",
                alertsEnabled = repository.hasDeviceRegistration(),
            )
        } else {
            NotificationState(
                "Some pending alerts were dropped, and current announcements could not be refreshed. Open Recalls and try again.",
                alertsEnabled = repository.hasDeviceRegistration(),
            )
        }
    }

    fun permissionDenied() {
        lifecycle.optOut()
        mutableState.value = NotificationState("Notifications are off. Your watchlist still works in the app.")
    }

    fun hasNotificationPermission(): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private suspend fun registerWithFirebase() {
        val messaging = firebaseMessagingOrNull()
        if (messaging == null) {
            mutableState.value = NotificationState("Matching alerts are temporarily unavailable. Browsing still works.")
            return
        }
        mutableState.value = NotificationState("Connecting this watchlist…", isWorking = true)
        try {
            // FCM 25+ delivers the current Firebase Installation ID to onRegistered().
            messaging.register().awaitUnit()
            mutableState.value = NotificationState("Finishing alert setup…", isWorking = true)
        } catch (_: Exception) {
            mutableState.value = NotificationState(
                "Beanstalk couldn't connect alerts. It will retry when the app opens.",
            )
        }
    }

    private fun firebaseMessagingOrNull(): FirebaseMessaging? = runCatching {
        if (FirebaseApp.getApps(context).isEmpty()) FirebaseApp.initializeApp(context)
        if (FirebaseApp.getApps(context).isEmpty()) null else FirebaseMessaging.getInstance()
    }.getOrNull()

    @SuppressLint("ApplySharedPref")
    private fun storeAlertsDesired(desired: Boolean) {
        check(preferences.edit().putBoolean(ALERTS_DESIRED, desired).commit()) {
            "Could not persist the alert preference"
        }
    }

    private companion object {
        const val ALERTS_DESIRED = "alerts_desired"
    }
}

private suspend fun Task<Void>.awaitUnit(): Unit = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { if (continuation.isActive) continuation.resume(Unit) }
    addOnFailureListener { if (continuation.isActive) continuation.resumeWithException(it) }
    addOnCanceledListener { continuation.cancel() }
}
