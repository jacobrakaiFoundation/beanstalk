package org.jacobrakaifoundation.beanstalk.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RecallNotice(
    val id: String,
    val title: String,
    val summary: String,
    val productDescription: String? = null,
    val reasonForRecall: String? = null,
    val companyName: String? = null,
    val classification: String? = null,
    val status: String? = null,
    val distribution: String? = null,
    val codeInfo: String? = null,
    val publicationDate: String,
    val recallInitiationDate: String? = null,
    val retrievedAt: String,
    val sourceURL: String,
) {
    fun searchableFields(): List<WatchField> = listOf(
        WatchField("title", title),
        WatchField("summary", summary),
        WatchField("product", productDescription.orEmpty()),
        WatchField("reason", reasonForRecall.orEmpty()),
        WatchField("company", companyName.orEmpty()),
        WatchField("distribution", distribution.orEmpty()),
        WatchField("lot or code", codeInfo.orEmpty()),
    )
}

@Serializable
data class RecallNoticePage(
    val items: List<RecallNotice>,
    val nextCursor: String? = null,
)

@Serializable
data class OpenFdaResponse(
    val meta: OpenFdaMetadata,
    val results: List<OpenFdaRecordDto>,
)

@Serializable
data class OpenFdaMetadata(val results: OpenFdaResults)

@Serializable
data class OpenFdaResults(
    val skip: Int,
    val limit: Int,
    val total: Int,
)

@Serializable
data class OpenFdaRecordDto(
    @SerialName("recall_number") val recallNumber: String? = null,
    @SerialName("event_id") val eventID: String? = null,
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
)

@Serializable
data class EnforcementRecord(
    val id: String,
    val recallNumber: String,
    val eventID: String,
    val productDescription: String,
    val reasonForRecall: String,
    val classification: String,
    val rawClassification: String? = null,
    val status: String,
    val rawStatus: String? = null,
    val distributionPattern: String,
    val recallingFirm: String,
    val city: String,
    val state: String,
    val country: String,
    val publicationDate: String,
    val recallInitiationDate: String,
    val retrievedAt: String,
    val productType: String,
    val codeInfo: String,
    val moreCodeInfo: String,
    val voluntaryMandated: String,
    val address1: String,
    val address2: String,
    val postalCode: String,
    val centerClassificationDate: String,
    val initialFirmNotification: String,
    val productQuantity: String,
    val terminationDate: String,
) {
    val sourceURL: String
        get() {
            val predicate = if (recallNumber.isNotBlank()) {
                "recall_number:\"$recallNumber\""
            } else {
                "event_id:\"$eventID\""
            }
            return "https://api.fda.gov/food/enforcement.json?search=" +
                java.net.URLEncoder.encode(predicate, Charsets.UTF_8.name()).replace("+", "%20")
        }

    fun searchableFields(): List<WatchField> = listOf(
        WatchField("product", productDescription),
        WatchField("reason", reasonForRecall),
        WatchField("company", recallingFirm),
        WatchField("distribution", distributionPattern),
        WatchField("lot or code", "$codeInfo $moreCodeInfo"),
    )
}

@Serializable
data class EnforcementRecordPage(
    val items: List<EnforcementRecord>,
    val total: Int,
    val skip: Int,
    val limit: Int,
) {
    val hasMore: Boolean
        get() = skip + items.size < total && skip + items.size <= 25_000
}

data class EnforcementSearch(
    val query: String = "",
    val classification: String = "",
    val status: String = "",
    val limit: Int = 25,
    val page: Int = 0,
) {
    val skip: Int get() = page.coerceAtLeast(0) * limit.coerceIn(1, 100)
}

data class WatchField(val name: String, val text: String)

data class WatchMatch(
    val term: String,
    val field: String,
    val evidence: String,
)

data class NoticeWatchResult(
    val notice: RecallNotice,
    val matches: List<WatchMatch>,
)

data class LoadedValue<T>(
    val value: T,
    val isOfflineCopy: Boolean,
    val cachedAtEpochMillis: Long? = null,
)

enum class SavedRecallKind { NOTICE, ENFORCEMENT }

data class SavedRecall(
    val stableID: String,
    val kind: SavedRecallKind,
    val title: String,
    val subtitle: String,
    val payload: String,
    val savedAtEpochMillis: Long,
)

data class WatchTerm(
    val normalizedTerm: String,
    val createdAtEpochMillis: Long,
)

@Serializable
data class DeviceCredentials(
    val deviceID: String,
    val clientSecret: String,
    val pushIdentifier: String,
)

@Serializable
data class DeviceRegistrationResponse(
    val deviceId: String,
    val clientSecret: String,
)

@Serializable
data class DeviceResponse(
    val id: String,
    val provider: String? = null,
    val identifierKind: String? = null,
    val active: Boolean = true,
    val disabledReason: String? = null,
    val terms: List<String> = emptyList(),
)

@Serializable
data class DeviceRegistrationBody(
    val provider: String = "fcm",
    val pushIdentifier: String,
    val identifierKind: String = "fid",
)

@Serializable
data class WatchlistBody(val terms: List<String>)

data class NotificationTarget(
    val noticeID: String,
    val matchedTerm: String?,
    val matchedField: String?,
)
