package org.jacobrakaifoundation.beanstalk.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationTargetParserTest {
    private val validNoticeID = "notice_0123456789abcdef0123456789abcdef"

    @Test
    fun `notification payload ignores externally supplied match evidence`() {
        val target = NotificationTargetParser.fromData(
            mapOf(
                "noticeId" to validNoticeID,
                "matchedTerm" to "peanut butter",
                "matchedField" to "productDescription",
            ),
        )

        requireNotNull(target)
        assertEquals(validNoticeID, target.noticeID)
        assertNull(target.matchedTerm)
        assertNull(target.matchedField)
    }

    @Test
    fun `payload without notice id cannot navigate`() {
        assertNull(NotificationTargetParser.fromData(mapOf("matchedTerm" to "milk")))
    }

    @Test
    fun `closed-app launch extras route to the notice`() {
        val target = NotificationTargetParser.fromLaunchExtras(
            mapOf("noticeId" to validNoticeID, "title" to "Recall watchlist match"),
        )

        requireNotNull(target)
        assertEquals(validNoticeID, target.noticeID)
        assertNull(target.matchedTerm)
        assertNull(target.matchedField)
    }

    @Test
    fun `malformed notification targets are rejected`() {
        assertNull(NotificationTargetParser.fromData(mapOf("noticeId" to "../devices/me")))
    }
}
