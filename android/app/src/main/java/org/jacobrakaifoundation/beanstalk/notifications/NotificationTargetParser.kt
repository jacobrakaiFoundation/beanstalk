package org.jacobrakaifoundation.beanstalk.notifications

import android.net.Uri
import org.jacobrakaifoundation.beanstalk.data.model.NotificationTarget

object NotificationTargetParser {
    fun fromData(data: Map<String, String>): NotificationTarget? {
        val noticeID = data["noticeId"]?.takeIf(NOTICE_ID::matches) ?: return null
        return NotificationTarget(
            noticeID = noticeID,
            matchedTerm = null,
            matchedField = null,
        )
    }

    fun fromLaunchExtras(values: Map<String, String>): NotificationTarget? = fromData(values)

    fun fromUri(uri: Uri?): NotificationTarget? {
        if (uri?.scheme != "beanstalk" || uri.host != "notice") return null
        val noticeID = uri.pathSegments.singleOrNull()?.takeIf(NOTICE_ID::matches) ?: return null
        return NotificationTarget(
            noticeID = noticeID,
            matchedTerm = null,
            matchedField = null,
        )
    }

    private val NOTICE_ID = Regex("^notice_[a-f0-9]{32}$")
}
