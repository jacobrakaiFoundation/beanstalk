package org.jacobrakaifoundation.beanstalk

import android.app.Application
import android.content.pm.PackageManager
import com.google.firebase.FirebaseApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.MockWebServer
import org.jacobrakaifoundation.beanstalk.data.BeanstalkRepository
import org.jacobrakaifoundation.beanstalk.data.local.BeanstalkDatabase
import org.jacobrakaifoundation.beanstalk.data.local.LocalStore
import org.jacobrakaifoundation.beanstalk.data.local.SecureCredentialStore
import org.jacobrakaifoundation.beanstalk.data.network.BeanstalkApi
import org.jacobrakaifoundation.beanstalk.notifications.NotificationCoordinator
import org.jacobrakaifoundation.beanstalk.ui.BeanstalkViewModel
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = BeanstalkApplication::class, sdk = [35])
class ColdStartResilienceTest {
    @After
    fun tearDown() {
        RuntimeEnvironment.getApplication().deleteDatabase("beanstalk.sqlite")
    }

    @Test
    fun `application onCreate finishes without google-services or a default FirebaseApp`() {
        val app = RuntimeEnvironment.getApplication() as BeanstalkApplication
        assertFalse(app.repository.hasDeviceRegistration())
        assertTrue(FirebaseApp.getApps(app).isEmpty())
    }

    @Test
    fun `synchronize after cold start does not throw without Firebase or a live backend`() = runBlocking {
        val app = RuntimeEnvironment.getApplication() as BeanstalkApplication
        app.notificationCoordinator.synchronize()
        assertFalse(app.notificationCoordinator.state.value.alertsEnabled)
    }

    @Test
    fun `merged manifest disables FCM auto-init and strips Firebase process starters`() {
        val app = RuntimeEnvironment.getApplication()
        val packageManager = app.packageManager
        val applicationInfo = packageManager.getApplicationInfo(
            app.packageName,
            PackageManager.GET_META_DATA,
        )
        val meta = requireNotNull(applicationInfo.metaData)
        assertFalse(meta.getBoolean("firebase_messaging_auto_init_enabled", true))
        assertFalse(meta.getBoolean("firebase_analytics_collection_enabled", true))
        assertFalse(meta.getBoolean("firebase_data_collection_default_enabled", true))

        val packageInfo = packageManager.getPackageInfo(
            app.packageName,
            PackageManager.GET_PROVIDERS or PackageManager.GET_SERVICES or PackageManager.GET_RECEIVERS,
        )
        assertTrue(
            packageInfo.providers.orEmpty().none { it.name.contains("FirebaseInitProvider") },
        )
        assertTrue(
            packageInfo.services.orEmpty().none { it.name.contains("FirebaseMessagingService") },
        )
        assertTrue(
            packageInfo.receivers.orEmpty().none { it.name.contains("FirebaseInstanceIdReceiver") },
        )
    }

}

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [35])
class ApplicationGraphColdStartTest {
    @After
    fun tearDown() {
        RuntimeEnvironment.getApplication().deleteDatabase("beanstalk.sqlite")
    }

    @Test
    fun `application graph matches onCreate without opening a network connection`() {
        val context = RuntimeEnvironment.getApplication()
        context.deleteDatabase("beanstalk.sqlite")
        val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
            explicitNulls = false
        }
        val api = BeanstalkApi("https://api.beanstalk.jacobrakai.org", json)
        val repository = BeanstalkRepository(
            LocalStore(BeanstalkDatabase(context)),
            api,
            SecureCredentialStore(context, json),
        )
        val coordinator = NotificationCoordinator(context, repository)
        assertFalse(repository.hasDeviceRegistration())
        assertFalse(coordinator.state.value.alertsEnabled)
    }

    @Test
    fun `dead backend leaves the process alive with browse error UI`() = runBlocking {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        try {
            val context = RuntimeEnvironment.getApplication()
            context.deleteDatabase("beanstalk.sqlite")
            val json = Json {
                ignoreUnknownKeys = true
                encodeDefaults = true
                explicitNulls = false
            }
            val server = MockWebServer()
            server.start()
            val baseUrl = server.url("/").toString()
            val enforcementUrl = server.url("/food/enforcement.json").toString()
            server.shutdown()
            val repository = BeanstalkRepository(
                LocalStore(BeanstalkDatabase(context)),
                BeanstalkApi(
                    baseUrl,
                    json,
                    ioDispatcher = Dispatchers.Unconfined,
                    openFdaEnforcementUrl = enforcementUrl,
                ),
                SecureCredentialStore(context, json),
            )
            val coordinator = NotificationCoordinator(
                context,
                repository,
                isPushConfigured = { false },
            )
            val viewModel = BeanstalkViewModel(repository, coordinator)
            withTimeout(10_000) {
                while (viewModel.state.value.errorMessage == null) {
                    yield()
                    delay(10)
                }
            }
            val state = viewModel.state.value
            assertFalse("browse still loading: $state", state.isLoading)
            assertNotNull(state.errorMessage)
            assertFalse(state.notificationState.alertsEnabled)
        } finally {
            Dispatchers.resetMain()
        }
    }
}
