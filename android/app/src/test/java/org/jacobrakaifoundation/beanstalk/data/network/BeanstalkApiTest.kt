package org.jacobrakaifoundation.beanstalk.data.network

import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.jacobrakaifoundation.beanstalk.data.model.DeviceCredentials
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementSearch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BeanstalkApiTest {
    @Test
    fun `sanitizeQuery strips quotes and backslashes`() {
        assertEquals("peanut butter", BeanstalkApi.sanitizeQuery("  peanut\" butter\\ "))
        assertEquals("", BeanstalkApi.sanitizeQuery("\"\\\""))
    }

    @Test
    fun `registerDevice sends an FCM token identifier kind`() = runTest(timeout = 10.seconds) {
        withApi { api, server ->
            server.enqueue(MockResponse().setBody("""{"deviceId":"device","clientSecret":"secret"}"""))
            api.registerDevice("dXyZ:APA91b-registration-token")
            val recorded = server.takeRequest()
            assertEquals("/v1/devices", recorded.path)
            assertEquals("POST", recorded.method)
            val body = recorded.body.readUtf8()
            assertTrue(body.contains("\"provider\":\"fcm\""))
            assertTrue(body.contains("\"identifierKind\":\"token\""))
            assertTrue(body.contains("dXyZ:APA91b-registration-token"))
            assertFalse(body.contains("\"fid\""))
        }
    }

    @Test
    fun `updatePushIdentifier rotates at me token and accepts a status payload`() = runTest(timeout = 10.seconds) {
        withApi { api, server ->
            server.enqueue(
                MockResponse().setBody(
                    """{"id":"device","provider":"fcm","identifierKind":"token","environment":null,"active":true,"disabledReason":null,"terms":[]}""",
                ),
            )
            api.updatePushIdentifier(
                DeviceCredentials("device", "secret", "old-token"),
                "dXyZ:APA91b-rotated",
            )
            val recorded = server.takeRequest()
            assertEquals("/v1/devices/me/token", recorded.path)
            assertEquals("PUT", recorded.method)
            assertEquals("Bearer device.secret", recorded.getHeader("Authorization"))
            val body = recorded.body.readUtf8()
            assertTrue(body.contains("\"identifierKind\":\"token\""))
            assertTrue(body.contains("dXyZ:APA91b-rotated"))
        }
    }

    @Test
    fun `notices sanitizes and caps the query at 120 characters`() = runTest(timeout = 10.seconds) {
        withApi { api, server ->
            server.enqueue(MockResponse().setBody("""{"items":[]}"""))
            api.notices("peanut\"butter\\" + "x".repeat(200), null, 30)
            val recorded = server.takeRequest()
            val query = recorded.requestUrl!!.queryParameter("query")!!
            assertFalse(query.contains("\""))
            assertFalse(query.contains("\\"))
            assertEquals(BeanstalkApi.NOTICE_QUERY_MAX, query.length)
            assertEquals("30", recorded.requestUrl!!.queryParameter("limit"))
        }
    }

    @Test
    fun `notices omits a quotes-only query`() = runTest(timeout = 10.seconds) {
        withApi { api, server ->
            server.enqueue(MockResponse().setBody("""{"items":[]}"""))
            api.notices("\"\"", null, 30)
            val recorded = server.takeRequest()
            assertNull(recorded.requestUrl!!.queryParameter("query"))
        }
    }

    @Test
    fun `enforcement latest page uses report_date sort and never calls notices`() = runTest(timeout = 10.seconds) {
        withApi { api, server ->
            server.enqueue(
                MockResponse().setBody(
                    """{"results":[{"recall_number":"F-001-2026","product_description":"Milk","reason_for_recall":"Listeria","recalling_firm":"Acme","report_date":"20260915"}],"meta":{"results":{"skip":0,"limit":25,"total":1}}}""",
                ),
            )
            val page = api.enforcement(EnforcementSearch(limit = 25, page = 0))
            assertEquals(1, server.requestCount)
            val recorded = server.takeRequest()
            assertEquals("/food/enforcement.json", recorded.requestUrl!!.encodedPath)
            assertEquals("25", recorded.requestUrl!!.queryParameter("limit"))
            assertEquals("0", recorded.requestUrl!!.queryParameter("skip"))
            assertEquals("report_date:desc", recorded.requestUrl!!.queryParameter("sort"))
            assertNull(recorded.requestUrl!!.queryParameter("search"))
            assertEquals(1, page.items.size)
            assertEquals("F-001-2026", page.items.single().id)
        }
    }

    @Test
    fun `enforcement still reaches openFDA when the Beanstalk backend host is dead`() = runTest(timeout = 10.seconds) {
        val server = MockWebServer()
        server.start()
        try {
            server.enqueue(
                MockResponse().setBody(
                    """{"results":[{"recall_number":"F-009-2026","product_description":"Cheese"}],"meta":{"results":{"skip":0,"limit":25,"total":1}}}""",
                ),
            )
            val api = BeanstalkApi(
                "https://api.beanstalk.jacobrakai.org/",
                ioDispatcher = Dispatchers.Unconfined,
                openFdaEnforcementUrl = server.url("/food/enforcement.json").toString(),
            )
            val page = api.enforcement(EnforcementSearch(limit = 25, page = 0))
            assertEquals("F-009-2026", page.items.single().id)
            assertEquals("/food/enforcement.json", server.takeRequest().requestUrl!!.encodedPath)
        } finally {
            server.shutdown()
        }
    }

    @Test
    fun `enforcement interpolates a sanitized query`() = runTest(timeout = 10.seconds) {
        withApi { api, server ->
            server.enqueue(MockResponse().setBody("""{"results":[],"meta":{"results":{"skip":0,"limit":20,"total":0}}}"""))
            api.enforcement(EnforcementSearch(query = "peanut\"butter", limit = 20, page = 0))
            val recorded = server.takeRequest()
            val search = recorded.requestUrl!!.queryParameter("search")!!
            assertTrue(search.contains("peanutbutter"))
            assertFalse(search.contains("peanut\"butter"))
        }
    }

    @Test
    fun `enforcement rejects an openFDA skip beyond 25000`() = runTest(timeout = 10.seconds) {
        withApi { api, _ ->
            try {
                api.enforcement(EnforcementSearch(page = 251, limit = 100))
                throw AssertionError("expected ApiException")
            } catch (error: ApiException) {
                assertEquals(400, error.statusCode)
            }
        }
    }

    private suspend fun withApi(block: suspend (BeanstalkApi, MockWebServer) -> Unit) {
        val server = MockWebServer()
        server.start()
        try {
            block(
                BeanstalkApi(
                    server.url("/").toString(),
                    ioDispatcher = Dispatchers.Unconfined,
                    openFdaEnforcementUrl = server.url("/food/enforcement.json").toString(),
                ),
                server,
            )
        } finally {
            server.shutdown()
        }
    }
}
