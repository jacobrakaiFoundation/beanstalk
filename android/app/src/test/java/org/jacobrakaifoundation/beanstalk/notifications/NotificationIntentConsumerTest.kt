package org.jacobrakaifoundation.beanstalk.notifications

import android.app.Application
import android.content.Intent
import android.net.Uri
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, sdk = [35])
class NotificationIntentConsumerTest {
    private val id = "notice_0123456789abcdef0123456789abcdef"

    @Test
    fun `closed app extras are consumed and do not replay from a retained intent`() {
        val launch = Intent().putExtra("noticeId", id).putExtra("unrelated", "keep")
        assertEquals(id, NotificationIntentConsumer.consume(launch)?.noticeID)
        assertNull(NotificationIntentConsumer.consume(Intent(launch)))
        assertEquals("keep", launch.getStringExtra("unrelated"))
        assertEquals(id, NotificationIntentConsumer.consume(Intent().putExtra("noticeId", id))?.noticeID)
    }

    @Test
    fun `deep link does not replay after restoration`() {
        val launch = Intent(Intent.ACTION_VIEW, Uri.parse("beanstalk://notice/$id"))
        assertEquals(id, NotificationIntentConsumer.consume(launch)?.noticeID)
        assertNull(launch.data)
        assertNull(NotificationIntentConsumer.consume(launch))
        val restored = Intent(Intent.ACTION_VIEW, Uri.parse("beanstalk://notice/$id"))
        assertNull(NotificationIntentConsumer.consume(restored, restoring = true))
        assertNull(restored.data)
    }
}
