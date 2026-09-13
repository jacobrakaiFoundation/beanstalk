package org.jacobrakaifoundation.beanstalk.data.network

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class BeanstalkApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: BeanstalkApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = BeanstalkApi(server.url("/").toString(), OkHttpClient())
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `android registers an FCM installation id without legacy token fields`() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"deviceId":"device-1","clientSecret":"secret-1"}"""),
        )

        val result = api.registerDevice("c2FtcGxlLWZpcmViYXNlLWluc3RhbGxhdGlvbi1pZA")
        val request = server.takeRequest()
        val body = Json.parseToJsonElement(request.body.readUtf8()).jsonObject

        assertEquals("device-1", result.deviceId)
        assertEquals("fcm", body.getValue("provider").jsonPrimitive.content)
        assertEquals("fid", body.getValue("identifierKind").jsonPrimitive.content)
        assertEquals(
            "c2FtcGxlLWZpcmViYXNlLWluc3RhbGxhdGlvbi1pZA",
            body.getValue("pushIdentifier").jsonPrimitive.content,
        )
        assertEquals(null, body["deviceToken"])
        assertEquals(null, body["environment"])
    }
}
