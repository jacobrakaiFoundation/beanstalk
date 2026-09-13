package org.jacobrakaifoundation.beanstalk

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.jacobrakaifoundation.beanstalk.notifications.NotificationTargetParser
import org.jacobrakaifoundation.beanstalk.ui.BeanstalkApp
import org.jacobrakaifoundation.beanstalk.ui.BeanstalkViewModel

class MainActivity : ComponentActivity() {
    private val viewModel: BeanstalkViewModel by viewModels {
        val application = application as BeanstalkApplication
        BeanstalkViewModel.Factory(application.repository, application.notificationCoordinator)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)
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

    private fun handleIntent(intent: Intent?) {
        val extras = intent?.extras?.keySet().orEmpty().mapNotNull { key ->
            intent?.extras?.getString(key)?.let { key to it }
        }.toMap()
        (NotificationTargetParser.fromUri(intent?.data) ?: NotificationTargetParser.fromLaunchExtras(extras))
            ?.let(viewModel::openNotificationTarget)
    }
}
