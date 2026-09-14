package org.jacobrakaifoundation.beanstalk.notifications

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.jacobrakaifoundation.beanstalk.BeanstalkApplication
import org.jacobrakaifoundation.beanstalk.MainActivity
import org.jacobrakaifoundation.beanstalk.R

// FCM 25.1.3 replaces legacy token callbacks with onRegistered(FID) when the
// manifest's installation-ID flag is enabled. The bundled lint still checks
// only for the deprecated onNewToken callback.
@SuppressLint("MissingFirebaseInstanceTokenRefresh")
class BeanstalkMessagingService : FirebaseMessagingService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onRegistered(installationId: String) {
        val application = application as BeanstalkApplication
        serviceScope.launch { application.notificationCoordinator.onRegistered(installationId) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val target = NotificationTargetParser.fromData(message.data) ?: return
        createNotificationChannel()
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val uri = Uri.Builder()
            .scheme("beanstalk")
            .authority("notice")
            .appendPath(target.noticeID)
            .apply {
                target.matchedTerm?.let { appendQueryParameter("matchedTerm", it) }
                target.matchedField?.let { appendQueryParameter("matchedField", it) }
            }
            .build()
        val intent = Intent(this, MainActivity::class.java).apply {
            component = ComponentName(this@BeanstalkMessagingService, MainActivity::class.java)
            action = Intent.ACTION_VIEW
            data = uri
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            target.noticeID.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE,
        )
        val title = message.notification?.title ?: message.data["title"] ?: "Recall watchlist match"
        val body = message.notification?.body ?: message.data["body"]
            ?: target.matchedTerm?.let { "“$it” matched a published FDA recall announcement." }
            ?: "A published FDA recall announcement matched your watchlist."
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(this, R.color.beanstalk_leaf))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        NotificationManagerCompat.from(this).notify(target.noticeID.hashCode(), notification)
    }

    override fun onDeletedMessages() {
        val application = application as BeanstalkApplication
        serviceScope.launch { application.notificationCoordinator.onDeletedMessages() }
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = getString(R.string.notification_channel_description)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private companion object {
        const val CHANNEL_ID = "recall_matches"
    }
}
