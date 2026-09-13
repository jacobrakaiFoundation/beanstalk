package org.jacobrakaifoundation.beanstalk.domain

import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecord
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecordPage
import org.jacobrakaifoundation.beanstalk.data.model.OpenFdaRecordDto
import org.jacobrakaifoundation.beanstalk.data.model.OpenFdaResponse

object OpenFdaMapper {
    private val knownClassifications = setOf("Class I", "Class II", "Class III", "Not Yet Classified")

    fun map(source: OpenFdaRecordDto, retrievedAt: String): EnforcementRecord {
        val recallNumber = source.recallNumber?.trim().orEmpty()
        val eventID = source.eventID?.trim().orEmpty()
        val identity = recallNumber.ifBlank {
            "source:$eventID|${source.productDescription.orEmpty()}|${source.codeInfo.orEmpty()}"
        }
        return EnforcementRecord(
            id = identity,
            recallNumber = recallNumber,
            eventID = eventID,
            productDescription = source.productDescription.orEmpty(),
            reasonForRecall = source.reasonForRecall.orEmpty(),
            classification = source.classification?.trim().takeIf { it in knownClassifications } ?: "Unknown",
            rawClassification = source.classification,
            status = source.status?.trim().takeUnless { it.isNullOrEmpty() } ?: "Unknown",
            rawStatus = source.status,
            distributionPattern = source.distributionPattern.orEmpty(),
            recallingFirm = source.recallingFirm.orEmpty(),
            city = source.city.orEmpty(),
            state = source.state.orEmpty(),
            country = source.country.orEmpty(),
            publicationDate = source.reportDate.orEmpty(),
            recallInitiationDate = source.recallInitiationDate.orEmpty(),
            retrievedAt = retrievedAt,
            productType = source.productType.orEmpty(),
            codeInfo = source.codeInfo.orEmpty(),
            moreCodeInfo = source.moreCodeInfo.orEmpty(),
            voluntaryMandated = source.voluntaryMandated.orEmpty(),
            address1 = source.address1.orEmpty(),
            address2 = source.address2.orEmpty(),
            postalCode = source.postalCode.orEmpty(),
            centerClassificationDate = source.centerClassificationDate.orEmpty(),
            initialFirmNotification = source.initialFirmNotification.orEmpty(),
            productQuantity = source.productQuantity.orEmpty(),
            terminationDate = source.terminationDate.orEmpty(),
        )
    }

    fun map(response: OpenFdaResponse, retrievedAt: String): EnforcementRecordPage = EnforcementRecordPage(
        items = response.results.map { map(it, retrievedAt) },
        total = response.meta.results.total,
        skip = response.meta.results.skip,
        limit = response.meta.results.limit,
    )
}
