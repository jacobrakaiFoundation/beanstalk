package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.notifications.AlertControlPolicy
import org.jacobrakaifoundation.beanstalk.notifications.AlertSettingsAction

internal const val PRIVACY_POLICY_URL =
    "https://jacobrakaifoundation.github.io/beanstalk/privacy.html"
internal const val SUPPORT_URL =
    "https://jacobrakaifoundation.github.io/beanstalk/support.html"
internal const val FDA_RECALLS_URL =
    "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts"
internal const val USDA_FSIS_RECALLS_URL =
    "https://www.fsis.usda.gov/recalls"

internal const val AFFILIATION_DISCLAIMER =
    "Beanstalk is independent and is not affiliated with or endorsed by FDA or USDA FSIS. It is not medical advice."

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    state: BeanstalkUiState,
    onRequestNotifications: () -> Unit,
    onDisableNotifications: () -> Unit,
    onClearLocalData: () -> Unit,
) {
    Scaffold(
        contentWindowInsets = tabScaffoldInsets(),
        topBar = { TopAppBar(title = { Text("Settings") }) },
    ) { padding ->
        val uriHandler = LocalUriHandler.current
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Text("Notifications", style = MaterialTheme.typography.titleMedium) }
            item { InformationBanner(state.notificationState.message) }
            val alerts = state.notificationState
            when (AlertControlPolicy.settingsAction(alerts.alertsEnabled, alerts.alertsAvailable)) {
                AlertSettingsAction.TURN_OFF -> item {
                    OutlinedButton(onClick = onDisableNotifications, modifier = Modifier.fillMaxWidth()) {
                        Text("Turn alerts off")
                    }
                }
                AlertSettingsAction.TURN_ON -> item {
                    Button(
                        onClick = onRequestNotifications,
                        enabled = !alerts.isWorking,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Enable alerts") }
                }
                AlertSettingsAction.NONE -> Unit
            }
            item { Text("This device", style = MaterialTheme.typography.titleMedium) }
            item {
                OutlinedButton(onClick = onClearLocalData, modifier = Modifier.fillMaxWidth()) {
                    Text("Clear saved data")
                }
            }
            state.localDataMessage?.let { item { InformationBanner(it) } }
            item { InformationBanner(AFFILIATION_DISCLAIMER) }
            item { SettingsLink("Privacy policy", PRIVACY_POLICY_URL, uriHandler) }
            item { SettingsLink("Support", SUPPORT_URL, uriHandler) }
            item { SettingsLink("FDA food recalls", FDA_RECALLS_URL, uriHandler) }
            item { SettingsLink("USDA FSIS recalls", USDA_FSIS_RECALLS_URL, uriHandler) }
        }
    }
}

@Composable
private fun SettingsLink(
    label: String,
    url: String,
    uriHandler: UriHandler,
) {
    TextButton(
        onClick = { uriHandler.openUri(url) },
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(label, modifier = Modifier.weight(1f))
    }
}
