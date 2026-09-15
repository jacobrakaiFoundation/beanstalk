package org.jacobrakaifoundation.beanstalk.data.network

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
    fun `registerDevice sends an FCM token identifier kind`() = runTest {
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
    fun `updatePushIdentifier rotates at me token and accepts a status payload`() = runTest {
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
    fun `notices sanitizes and caps the query at 120 characters`() = runTest {
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
    fun `notices omits a quotes-only query`() = runTest {
        withApi { api, server ->
            server.enqueue(MockResponse().setBody("""{"items":[]}"""))
            api.notices("\"\"", null, 30)
            val recorded = server.takeRequest()
            assertNull(recorded.requestUrl!!.queryParameter("query"))
        }
    }

    @Test
    fun `enforcement interpolates a sanitized query`() = runTest {
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
    fun `enforcement rejects an openFDA skip beyond 25000`() = runTest {
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
            block(BeanstalkApi(server.url("/").toString()), server)
        } finally {
            server.shutdown()
        }
    }
}
