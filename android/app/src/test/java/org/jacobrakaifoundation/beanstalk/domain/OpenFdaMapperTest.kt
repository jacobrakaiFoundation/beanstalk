package org.jacobrakaifoundation.beanstalk.domain

import org.jacobrakaifoundation.beanstalk.data.model.OpenFdaRecordDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OpenFdaMapperTest {
    @Test
    fun `unknown source classification stays visible and normalized`() {
        val record = OpenFdaMapper.map(
            OpenFdaRecordDto(
                recallNumber = "F-1234-2026",
                productDescription = "Original product wording; LOT 7A",
                classification = "Pending review",
                status = null,
                codeInfo = "LOT 7A",
                reportDate = "20260901",
                recallInitiationDate = "20260830",
            ),
            retrievedAt = "2026-09-13T20:00:00Z",
        )

        assertEquals("Unknown", record.classification)
        assertEquals("Pending review", record.rawClassification)
        assertEquals("Unknown", record.status)
        assertEquals("Original product wording; LOT 7A", record.productDescription)
        assertEquals("LOT 7A", record.codeInfo)
        assertEquals("20260901", record.publicationDate)
        assertEquals("20260830", record.recallInitiationDate)
        assertEquals("2026-09-13T20:00:00Z", record.retrievedAt)
    }

    @Test
    fun `record without recall number receives stable source identity`() {
        val record = OpenFdaMapper.map(
            OpenFdaRecordDto(eventID = "987", productDescription = "Food", codeInfo = "A1"),
            retrievedAt = "2026-09-13T20:00:00Z",
        )

        assertTrue(record.id.startsWith("source:987|Food|A1"))
        assertTrue(record.sourceURL.contains("event_id"))
    }
}
