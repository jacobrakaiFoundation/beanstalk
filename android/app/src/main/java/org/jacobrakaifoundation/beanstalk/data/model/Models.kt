package org.jacobrakaifoundation.beanstalk.data.model

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
        get() = when {
            recallNumber.isNotBlank() ->
                "https://api.fda.gov/food/enforcement.json?search=recall_number:\"$recallNumber\""
            eventID.isNotBlank() ->
                "https://api.fda.gov/food/enforcement.json?search=event_id:\"$eventID\""
            else -> "https://api.fda.gov/food/enforcement.json"
        }

    fun searchableFields(): List<WatchField> = listOf(
        WatchField("product", productDescription),
        WatchField("reason", reasonForRecall),
        WatchField("company", recallingFirm),
        WatchField("distribution", distributionPattern),
        WatchField("lot or code", listOf(codeInfo, moreCodeInfo).joinToString(" ")),
    )
}

@Serializable
data class EnforcementRecordPage(
    val items: List<EnforcementRecord>,
    val total: Int,
    val skip: Int,
    val limit: Int,
) {
    val hasMore: Boolean get() = skip + items.size < total && skip + items.size <= 25_000
}

data class EnforcementSearch(
    val query: String = "",
    val classification: String = "",
    val status: String = "",
    val page: Int = 0,
    val limit: Int = 20,
)

data class LoadedValue<T>(
    val value: T,
    val isOfflineCopy: Boolean = false,
    val cachedAtEpochMillis: Long? = null,
)

@Serializable
data class DeviceCredentials(
    val deviceId: String,
    val clientSecret: String,
    val pushIdentifier: String,
)

@Serializable
data class SavedRecall(
    val stableID: String,
    val kind: SavedRecallKind,
    val title: String,
    val subtitle: String,
    val payload: String,
    val savedAtEpochMillis: Long,
)

@Serializable
enum class SavedRecallKind { NOTICE, ENFORCEMENT }

@Serializable
data class WatchTerm(
    val normalizedTerm: String,
    val createdAtEpochMillis: Long,
)

data class WatchField(val name: String, val text: String)

data class WatchMatch(val term: String, val field: String, val evidence: String)

data class NoticeWatchResult(val notice: RecallNotice, val matches: List<WatchMatch>)

data class NotificationTarget(
    val noticeID: String,
    val matchedTerm: String? = null,
    val matchedField: String? = null,
)
