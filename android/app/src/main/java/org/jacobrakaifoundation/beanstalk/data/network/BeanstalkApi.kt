package org.jacobrakaifoundation.beanstalk.data.network

import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.jacobrakaifoundation.beanstalk.data.model.DeviceCredentials
import org.jacobrakaifoundation.beanstalk.data.model.DeviceRegistrationBody
import org.jacobrakaifoundation.beanstalk.data.model.DeviceRegistrationResponse
import org.jacobrakaifoundation.beanstalk.data.model.DeviceResponse
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecordPage
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementSearch
import org.jacobrakaifoundation.beanstalk.data.model.OpenFdaMetadata
import org.jacobrakaifoundation.beanstalk.data.model.OpenFdaResponse
import org.jacobrakaifoundation.beanstalk.data.model.OpenFdaResults
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.data.model.RecallNoticePage
import org.jacobrakaifoundation.beanstalk.data.model.WatchlistBody
import org.jacobrakaifoundation.beanstalk.domain.OpenFdaMapper

class ApiException(
    val statusCode: Int,
    override val message: String,
) : IOException(message)

class BeanstalkApi(
    private val backendBaseURL: String,
    private val client: OkHttpClient = OkHttpClient(),
    internal val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    },
    private val now: () -> String = { java.time.Instant.now().toString() },
) {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun notices(query: String, cursor: String? = null, limit: Int = 30): RecallNoticePage {
        val request = Request.Builder().url(RequestBuilders.notices(backendBaseURL, limit, cursor, query)).get().build()
        return executeJson(request)
    }

    suspend fun notice(id: String): RecallNotice {
        val request = Request.Builder().url(RequestBuilders.noticeDetail(backendBaseURL, id)).get().build()
        return executeJson(request)
    }

    suspend fun enforcement(search: EnforcementSearch): EnforcementRecordPage {
        val request = Request.Builder().url(RequestBuilders.enforcement(search)).get().build()
        return try {
            val response: OpenFdaResponse = executeJson(request)
            OpenFdaMapper.map(response, retrievedAt = now())
        } catch (error: ApiException) {
            // openFDA uses 404 for a valid query with no matching records.
            if (error.statusCode != 404) throw error
            OpenFdaMapper.map(
                OpenFdaResponse(
                    meta = OpenFdaMetadata(OpenFdaResults(search.skip, search.limit.coerceIn(1, 100), 0)),
                    results = emptyList(),
                ),
                retrievedAt = now(),
            )
        }
    }

    suspend fun registerDevice(pushIdentifier: String): DeviceRegistrationResponse {
        val body = json.encodeToString(DeviceRegistrationBody(pushIdentifier = pushIdentifier))
        val request = Request.Builder()
            .url("${backendBaseURL.trimEnd('/')}/v1/devices")
            .post(body.toRequestBody(jsonMediaType))
            .build()
        return executeJson(request)
    }

    suspend fun device(credentials: DeviceCredentials): DeviceResponse = executeJson(
        authenticatedRequest("${backendBaseURL.trimEnd('/')}/v1/devices/me", credentials).get().build(),
    )

    suspend fun updatePushIdentifier(
        credentials: DeviceCredentials,
        pushIdentifier: String,
    ): DeviceResponse {
        val body = json.encodeToString(DeviceRegistrationBody(pushIdentifier = pushIdentifier))
        val request = authenticatedRequest("${backendBaseURL.trimEnd('/')}/v1/devices/me/token", credentials)
            .put(body.toRequestBody(jsonMediaType))
            .build()
        return executeJson(request)
    }

    suspend fun updateWatchlist(credentials: DeviceCredentials, terms: List<String>): List<String> {
        val body = json.encodeToString(WatchlistBody(terms))
        val request = authenticatedRequest("${backendBaseURL.trimEnd('/')}/v1/devices/me/watchlist", credentials)
            .put(body.toRequestBody(jsonMediaType))
            .build()
        val response: WatchlistBody = executeJson(request)
        return response.terms
    }

    suspend fun deleteDevice(credentials: DeviceCredentials) {
        val request = authenticatedRequest("${backendBaseURL.trimEnd('/')}/v1/devices/me", credentials)
            .delete()
            .build()
        executeEmpty(request)
    }

    private fun authenticatedRequest(url: String, credentials: DeviceCredentials): Request.Builder = Request.Builder()
        .url(url)
        .header("Authorization", "Bearer ${credentials.deviceID}.${credentials.clientSecret}")

    private suspend inline fun <reified T> executeJson(request: Request): T {
        val response = client.newCall(request).await()
        response.use {
            val body = it.body.string()
            if (!it.isSuccessful) throw ApiException(it.code, errorMessage(body, it.code))
            try {
                return json.decodeFromString(body)
            } catch (error: SerializationException) {
                throw IOException("The data source returned an unreadable response.", error)
            }
        }
    }

    private suspend fun executeEmpty(request: Request) {
        client.newCall(request).await().use {
            if (!it.isSuccessful) {
                val body = it.body.string()
                throw ApiException(it.code, errorMessage(body, it.code))
            }
        }
    }

    private fun errorMessage(body: String, statusCode: Int): String = runCatching {
        json.parseToJsonElement(body).jsonObject["error"]?.jsonObject?.get("message")?.jsonPrimitive?.content
    }.getOrNull().takeUnless { it.isNullOrBlank() } ?: "The data source returned HTTP $statusCode."
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (continuation.isActive) continuation.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            continuation.resume(response) { _, value, _ -> value.close() }
        }
    })
}
