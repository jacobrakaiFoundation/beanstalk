package org.jacobrakaifoundation.beanstalk

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.jacobrakaifoundation.beanstalk.notifications.NotificationIntentConsumer
import org.jacobrakaifoundation.beanstalk.ui.BeanstalkApp
import org.jacobrakaifoundation.beanstalk.ui.BeanstalkViewModel

class MainActivity : ComponentActivity() {
    private val viewModel: BeanstalkViewModel by viewModels {
        val application = application as BeanstalkApplication
        BeanstalkViewModel.Factory(application.repository, application.notificationCoordinator)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        handleIntent(intent, restoring = savedInstanceState != null)
        setContent { BeanstalkApp(viewModel) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch { viewModel.synchronizeNotifications() }
    }

    private fun handleIntent(intent: Intent?, restoring: Boolean = false) {
        NotificationIntentConsumer.consume(intent, restoring)?.let(viewModel::openNotificationTarget)
    }
}
