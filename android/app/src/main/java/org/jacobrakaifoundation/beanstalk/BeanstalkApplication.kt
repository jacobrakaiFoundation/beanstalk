package org.jacobrakaifoundation.beanstalk

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import kotlinx.serialization.json.Json
import org.jacobrakaifoundation.beanstalk.data.BeanstalkRepository
import org.jacobrakaifoundation.beanstalk.data.local.BeanstalkDatabase
import org.jacobrakaifoundation.beanstalk.data.local.LocalStore
import org.jacobrakaifoundation.beanstalk.data.local.SecureCredentialStore
import org.jacobrakaifoundation.beanstalk.data.network.BeanstalkApi
import org.jacobrakaifoundation.beanstalk.notifications.NotificationCoordinator

class BeanstalkApplication : Application() {
    lateinit var repository: BeanstalkRepository
        private set
    lateinit var notificationCoordinator: NotificationCoordinator
        private set

    override fun onCreate() {
        super.onCreate()
        ensureRecallMatchesChannel()
        val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
            explicitNulls = false
        }
        val local = LocalStore(BeanstalkDatabase(this))
        val credentials = SecureCredentialStore(this, json)
        val api = BeanstalkApi(BuildConfig.BACKEND_BASE_URL, json)
        repository = BeanstalkRepository(local, api, credentials)
        notificationCoordinator = NotificationCoordinator(this, repository)
    }

    private fun ensureRecallMatchesChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(
                RECALL_MATCHES_CHANNEL_ID,
                "Recall matches",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "FDA food recall alerts that match your watchlist"
            },
        )
    }

    companion object {
        const val RECALL_MATCHES_CHANNEL_ID = "recall_matches"
    }
}
