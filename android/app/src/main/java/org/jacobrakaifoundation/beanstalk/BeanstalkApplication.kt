package org.jacobrakaifoundation.beanstalk

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
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
        val api = BeanstalkApi(BuildConfig.BACKEND_BASE_URL)
        repository = BeanstalkRepository(
            local = LocalStore(BeanstalkDatabase(this)),
            api = api,
            credentials = SecureCredentialStore(this, api.json),
        )
        notificationCoordinator = NotificationCoordinator(this, repository)
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            "recall_matches",
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { description = getString(R.string.notification_channel_description) }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
