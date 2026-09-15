package org.jacobrakaifoundation.beanstalk.notifications

import android.net.Uri
import org.jacobrakaifoundation.beanstalk.data.model.NotificationTarget

internal object NotificationTargetParser {
    fun fromUri(uri: Uri?): NotificationTarget? {
        if (uri == null) return null
        if (uri.scheme != "beanstalk") return null
        if (uri.host != "notice") return null
        val id = uri.pathSegments.firstOrNull()?.takeIf { it.isNotBlank() } ?: return null
        return NotificationTarget(
            noticeID = id,
            matchedTerm = uri.getQueryParameter("matchedTerm")?.ifBlank { null },
            matchedField = uri.getQueryParameter("matchedField")?.ifBlank { null },
        )
    }

    fun fromLaunchExtras(extras: Map<String, String>): NotificationTarget? {
        val id = extras["noticeId"]?.ifBlank { null } ?: return null
        return NotificationTarget(
            noticeID = id,
            matchedTerm = extras["matchedTerm"]?.ifBlank { null },
            matchedField = extras["matchedField"]?.ifBlank { null },
        )
    }
}
