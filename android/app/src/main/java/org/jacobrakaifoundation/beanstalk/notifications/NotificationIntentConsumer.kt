package org.jacobrakaifoundation.beanstalk.notifications

import android.content.Intent
import org.jacobrakaifoundation.beanstalk.data.model.NotificationTarget

internal object NotificationIntentConsumer {
    /** Clear launch targets after handling so Activity recreation cannot replay them. */
    fun consume(intent: Intent?, restoring: Boolean = false): NotificationTarget? {
        if (intent == null) return null
        val extras = intent.getStringExtra("noticeId")?.let { mapOf("noticeId" to it) }.orEmpty()
        val target = NotificationTargetParser.fromUri(intent.data) ?: NotificationTargetParser.fromLaunchExtras(extras)
        if (target != null) {
            intent.data = null
            intent.removeExtra("noticeId")
            intent.removeExtra("matchedTerm")
            intent.removeExtra("matchedField")
        }
        return target.takeUnless { restoring }
    }
}
