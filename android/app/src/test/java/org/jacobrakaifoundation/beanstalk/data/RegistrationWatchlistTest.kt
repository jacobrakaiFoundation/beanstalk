package org.jacobrakaifoundation.beanstalk.data

import android.app.Application
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.jacobrakaifoundation.beanstalk.data.local.BeanstalkDatabase
import org.jacobrakaifoundation.beanstalk.data.local.DeviceCredentialStore
import org.jacobrakaifoundation.beanstalk.data.local.LocalStore
import org.jacobrakaifoundation.beanstalk.data.model.DeviceCredentials
import org.jacobrakaifoundation.beanstalk.data.model.WatchTerm
import org.jacobrakaifoundation.beanstalk.data.network.BeanstalkApi
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [35])
class RegistrationWatchlistTest {
    @Test
    fun `final-term removal during registration upload reaches server before acknowledgement`() = runBlocking {
        val context = RuntimeEnvironment.getApplication()
        context.deleteDatabase("beanstalk.sqlite")
        val database = BeanstalkDatabase(context)
        val local = LocalStore(database)
        val credentials = object : DeviceCredentialStore {
            var current: DeviceCredentials? = null
            override fun load() = current
            override fun save(credentials: DeviceCredentials) { current = credentials }
            override fun clear() { current = null }
        }
        val started = CompletableDeferred<Unit>()
        val finish = CompletableDeferred<Unit>()
        val bodies = mutableListOf<String>()
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                if (request.path == "/v1/devices") {
                    return MockResponse().setBody("""{"deviceId":"device","clientSecret":"secret"}""")
                }
                val body = request.body.readUtf8()
                synchronized(bodies) { bodies += body }
                if (body.contains("milk")) {
                    started.complete(Unit)
                    runBlocking { withTimeout(10_000) { finish.await() } }
                }
                return MockResponse().setBody(body)
            }
        }
        server.start()
        try {
            local.addWatchTerm(WatchTerm("milk", 1))
            val repository = BeanstalkRepository(local, BeanstalkApi(server.url("/").toString()), credentials)
            val registration = async { repository.registerPushIdentifier("installation") }
            withTimeout(10_000) { started.await() }
            local.removeWatchTerm("milk")
            finish.complete(Unit)
            withTimeout(10_000) { registration.await() }
            assertEquals(listOf("""{"terms":["milk"]}""", """{"terms":[]}"""), bodies)
            assertFalse(local.isWatchlistSyncPending())
            assertTrue(local.watchTerms().isEmpty())
        } finally {
            finish.complete(Unit)
            server.shutdown()
            database.close()
            context.deleteDatabase("beanstalk.sqlite")
        }
    }
}
