package org.jacobrakaifoundation.beanstalk.data.network

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.jacobrakaifoundation.beanstalk.data.model.DeviceCredentials
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecord
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecordPage
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementSearch
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.data.model.RecallNoticePage

class ApiException(val statusCode: Int, message: String) : IOException(message)

class BeanstalkApi(
    private val baseUrl: String,
    val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    },
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build(),
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun notices(query: String, cursor: String?, limit: Int): RecallNoticePage {
        val url = serviceUrl("v1/notices").newBuilder()
            .addQueryParameter("limit", limit.toString())
            .apply {
                if (query.isNotBlank()) addQueryParameter("query", query)
                if (!cursor.isNullOrBlank()) addQueryParameter("cursor", cursor)
            }
            .build()
        return get(url.toString())
    }

    suspend fun notice(id: String): RecallNotice = get(serviceUrl("v1/notices/$id").toString())

    suspend fun enforcement(search: EnforcementSearch): EnforcementRecordPage {
        val predicates = buildList {
            if (search.classification.isNotBlank()) add("classification:\"${search.classification}\"")
            if (search.status.isNotBlank()) add("status:\"${search.status}\"")
            if (search.query.isNotBlank()) {
                add(
                    "(product_description:\"${search.query}\" OR reason_for_recall:\"${search.query}\" OR recalling_firm:\"${search.query}\")",
                )
            }
        }
        val skip = search.page * search.limit
        val url = "https://api.fda.gov/food/enforcement.json".toHttpUrl().newBuilder()
            .addQueryParameter("limit", search.limit.toString())
            .addQueryParameter("skip", skip.toString())
            .addQueryParameter("sort", "report_date:desc")
            .apply {
                if (predicates.isNotEmpty()) addQueryParameter("search", predicates.joinToString(" AND "))
            }
            .build()
        val raw: OpenFdaResponse = get(url.toString())
        val retrievedAt = java.time.Instant.ofEpochMilli(clock()).toString()
        val items = raw.results.orEmpty().map { it.toRecord(retrievedAt) }
        val meta = raw.meta?.results
        return EnforcementRecordPage(
            items = items,
            total = meta?.total ?: items.size,
            skip = meta?.skip ?: skip,
            limit = meta?.limit ?: search.limit,
        )
    }

    suspend fun registerDevice(pushIdentifier: String): DeviceRegistrationResponse {
        val body = json.encodeToString(
            FcmRegistrationBody(pushIdentifier = pushIdentifier),
        )
        return execute(
            Request.Builder()
                .url(serviceUrl("v1/devices"))
                .post(body.toRequestBody(jsonMedia))
                .build(),
        )
    }

    suspend fun updateWatchlist(credentials: DeviceCredentials, terms: List<String>) {
        val body = json.encodeToString(WatchlistBody(terms))
        execute<WatchlistBody>(
            Request.Builder()
                .url(serviceUrl("v1/devices/me/watchlist"))
                .put(body.toRequestBody(jsonMedia))
                .header("Authorization", bearer(credentials))
                .build(),
        )
    }

    suspend fun updatePushIdentifier(credentials: DeviceCredentials, pushIdentifier: String) {
        val body = json.encodeToString(FcmRegistrationBody(pushIdentifier = pushIdentifier))
        execute<DeviceRegistrationResponse>(
            Request.Builder()
                .url(serviceUrl("v1/devices/me"))
                .put(body.toRequestBody(jsonMedia))
                .header("Authorization", bearer(credentials))
                .build(),
        )
    }

    suspend fun deleteDevice(credentials: DeviceCredentials) {
        execute<Unit>(
            Request.Builder()
                .url(serviceUrl("v1/devices/me"))
                .delete()
                .header("Authorization", bearer(credentials))
                .build(),
            allowEmpty = true,
        )
    }

    private fun serviceUrl(path: String) = baseUrl.trimEnd('/').toHttpUrl().newBuilder()
        .addPathSegments(path)
        .build()

    private fun bearer(credentials: DeviceCredentials) =
        "Bearer ${credentials.deviceId}.${credentials.clientSecret}"

    private inline fun <reified T> get(url: String): T = execute(Request.Builder().url(url).get().build())

    private inline fun <reified T> execute(request: Request, allowEmpty: Boolean = false): T {
        client.newCall(request).execute().use { response ->
            val payload = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw ApiException(response.code, payload.ifBlank { "HTTP ${response.code}" })
            }
            if (allowEmpty && payload.isBlank()) {
                @Suppress("UNCHECKED_CAST")
                return Unit as T
            }
            return json.decodeFromString(payload)
        }
    }
}

@Serializable
data class DeviceRegistrationResponse(
    val deviceId: String,
    val clientSecret: String,
)

@Serializable
private data class FcmRegistrationBody(
    val provider: String = "fcm",
    val pushIdentifier: String,
    val identifierKind: String = "fid",
)

@Serializable
private data class WatchlistBody(val terms: List<String>)

@Serializable
private data class OpenFdaResponse(
    val meta: OpenFdaMeta? = null,
    val results: List<OpenFdaRecord>? = null,
)

@Serializable
private data class OpenFdaMeta(val results: OpenFdaResultMeta? = null)

@Serializable
private data class OpenFdaResultMeta(
    val skip: Int? = null,
    val limit: Int? = null,
    val total: Int? = null,
)

@Serializable
private data class OpenFdaRecord(
    @SerialName("recall_number") val recallNumber: String? = null,
    @SerialName("event_id") val eventId: String? = null,
    @SerialName("product_description") val productDescription: String? = null,
    @SerialName("reason_for_recall") val reasonForRecall: String? = null,
    val classification: String? = null,
    val status: String? = null,
    @SerialName("distribution_pattern") val distributionPattern: String? = null,
    @SerialName("recalling_firm") val recallingFirm: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    @SerialName("recall_initiation_date") val recallInitiationDate: String? = null,
    @SerialName("report_date") val reportDate: String? = null,
    @SerialName("product_type") val productType: String? = null,
    @SerialName("code_info") val codeInfo: String? = null,
    @SerialName("more_code_info") val moreCodeInfo: String? = null,
    @SerialName("voluntary_mandated") val voluntaryMandated: String? = null,
    @SerialName("address_1") val address1: String? = null,
    @SerialName("address_2") val address2: String? = null,
    @SerialName("postal_code") val postalCode: String? = null,
    @SerialName("center_classification_date") val centerClassificationDate: String? = null,
    @SerialName("initial_firm_notification") val initialFirmNotification: String? = null,
    @SerialName("product_quantity") val productQuantity: String? = null,
    @SerialName("termination_date") val terminationDate: String? = null,
) {
    fun toRecord(retrievedAt: String): EnforcementRecord {
        val recallNumber = recallNumber.orEmpty().trim()
        val eventID = eventId.orEmpty().trim()
        val known = setOf("Class I", "Class II", "Class III", "Not Yet Classified")
        val trimmedClass = classification?.trim()
        val trimmedStatus = status?.trim()
        return EnforcementRecord(
            id = if (recallNumber.isNotEmpty()) recallNumber else "source:$eventID|${productDescription.orEmpty()}|${codeInfo.orEmpty()}",
            recallNumber = recallNumber,
            eventID = eventID,
            productDescription = productDescription.orEmpty(),
            reasonForRecall = reasonForRecall.orEmpty(),
            classification = if (trimmedClass != null && trimmedClass in known) trimmedClass else "Unknown",
            rawClassification = classification,
            status = if (trimmedStatus.isNullOrEmpty()) "Unknown" else trimmedStatus,
            rawStatus = status,
            distributionPattern = distributionPattern.orEmpty(),
            recallingFirm = recallingFirm.orEmpty(),
            city = city.orEmpty(),
            state = state.orEmpty(),
            country = country.orEmpty(),
            publicationDate = reportDate.orEmpty(),
            recallInitiationDate = recallInitiationDate.orEmpty(),
            retrievedAt = retrievedAt,
            productType = productType.orEmpty(),
            codeInfo = codeInfo.orEmpty(),
            moreCodeInfo = moreCodeInfo.orEmpty(),
            voluntaryMandated = voluntaryMandated.orEmpty(),
            address1 = address1.orEmpty(),
            address2 = address2.orEmpty(),
            postalCode = postalCode.orEmpty(),
            centerClassificationDate = centerClassificationDate.orEmpty(),
            initialFirmNotification = initialFirmNotification.orEmpty(),
            productQuantity = productQuantity.orEmpty(),
            terminationDate = terminationDate.orEmpty(),
        )
    }
}
