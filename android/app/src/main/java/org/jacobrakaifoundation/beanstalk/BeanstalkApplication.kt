package org.jacobrakaifoundation.beanstalk

import android.app.Application
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
}
