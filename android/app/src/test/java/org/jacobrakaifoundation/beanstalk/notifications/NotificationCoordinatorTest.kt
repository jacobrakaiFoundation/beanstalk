package org.jacobrakaifoundation.beanstalk.notifications

import android.app.Application
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.jacobrakaifoundation.beanstalk.data.BeanstalkRepository
import org.jacobrakaifoundation.beanstalk.data.local.BeanstalkDatabase
import org.jacobrakaifoundation.beanstalk.data.local.DeviceCredentialStore
import org.jacobrakaifoundation.beanstalk.data.local.LocalStore
import org.jacobrakaifoundation.beanstalk.data.model.DeviceCredentials
import org.jacobrakaifoundation.beanstalk.data.model.WatchTerm
import org.jacobrakaifoundation.beanstalk.data.network.BeanstalkApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [35])
class NotificationCoordinatorTest {
    @Test
    fun `synchronize without push never claims alerts are on`() = runBlocking {
        val credentials = MemoryCredentials(DeviceCredentials("device", "secret", "old-token"))
        val harness = harness(pushConfigured = false, credentials = credentials)
        try {
            harness.coordinator.synchronize()
            val state = harness.coordinator.state.value
            assertEquals(AlertControlPolicy.UNAVAILABLE_MESSAGE, state.message)
            assertFalse(state.alertsEnabled)
            assertFalse(state.alertsAvailable)
            assertEquals(0, harness.server.requestCount)
        } finally {
            harness.close()
        }
    }

    @Test
    fun `enableAlerts without push does not register`() = runBlocking {
        val credentials = MemoryCredentials()
        val harness = harness(
            pushConfigured = false,
            credentials = credentials,
            requestToken = { error("token should not be requested") },
        )
        try {
            harness.local.addWatchTerm(WatchTerm("milk", 1))
            harness.coordinator.enableAlerts()
            val state = harness.coordinator.state.value
            assertEquals(AlertControlPolicy.UNAVAILABLE_MESSAGE, state.message)
            assertFalse(state.alertsEnabled)
            assertFalse(state.alertsAvailable)
            assertNull(credentials.load())
            assertEquals(0, harness.server.requestCount)
        } finally {
            harness.close()
        }
    }

    @Test
    fun `synchronize with push and no registration offers enable`() = runBlocking {
        val harness = harness(pushConfigured = true)
        try {
            harness.coordinator.synchronize()
            val state = harness.coordinator.state.value
            assertTrue(state.alertsAvailable)
            assertFalse(state.alertsEnabled)
            assertTrue(state.message.contains("Alerts are off"))
        } finally {
            harness.close()
        }
    }

    @Test
    fun `enableAlerts with push fails honestly when the alert service is unreachable`() = runBlocking {
        val harness = harness(
            pushConfigured = true,
            requestToken = { "installation-token" },
        )
        try {
            harness.local.addWatchTerm(WatchTerm("milk", 1))
            harness.server.shutdown()
            harness.coordinator.enableAlerts()
            val state = harness.coordinator.state.value
            assertEquals(AlertControlPolicy.ENABLE_FAILED_MESSAGE, state.message)
            assertFalse(state.alertsEnabled)
            assertTrue(state.alertsAvailable)
            assertFalse(state.message.contains("debug", ignoreCase = true))
        } finally {
            harness.close()
        }
    }

    @Test
    fun `disableAlerts without push clears leftover registration and stays unavailable`() = runBlocking {
        val credentials = MemoryCredentials(DeviceCredentials("device", "secret", "old-token"))
        val harness = harness(pushConfigured = false, credentials = credentials)
        try {
            harness.server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
                override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                    return MockResponse().setResponseCode(204)
                }
            }
            harness.coordinator.disableAlerts()
            val state = harness.coordinator.state.value
            assertEquals(AlertControlPolicy.UNAVAILABLE_MESSAGE, state.message)
            assertFalse(state.alertsEnabled)
            assertFalse(state.alertsAvailable)
            assertNull(credentials.load())
        } finally {
            harness.close()
        }
    }

    private fun harness(
        pushConfigured: Boolean,
        credentials: DeviceCredentialStore = MemoryCredentials(),
        requestToken: suspend () -> String = { error("token should not be requested") },
    ): Harness {
        val context = RuntimeEnvironment.getApplication()
        context.deleteDatabase("beanstalk.sqlite")
        val database = BeanstalkDatabase(context)
        val local = LocalStore(database)
        val server = MockWebServer()
        val repository = BeanstalkRepository(
            local,
            BeanstalkApi(server.url("/").toString(), ioDispatcher = Dispatchers.Unconfined),
            credentials,
        )
        return Harness(
            local = local,
            database = database,
            server = server,
            coordinator = NotificationCoordinator(
                context,
                repository,
                isPushConfigured = { pushConfigured },
                requestPushToken = requestToken,
            ),
        )
    }

    private class Harness(
        val local: LocalStore,
        val database: BeanstalkDatabase,
        val server: MockWebServer,
        val coordinator: NotificationCoordinator,
    ) {
        fun close() {
            runCatching { server.shutdown() }
            database.close()
            RuntimeEnvironment.getApplication().deleteDatabase("beanstalk.sqlite")
        }
    }

    private class MemoryCredentials(
        private var current: DeviceCredentials? = null,
    ) : DeviceCredentialStore {
        override fun load() = current
        override fun save(credentials: DeviceCredentials) {
            current = credentials
        }
        override fun clear() {
            current = null
        }
    }
}
