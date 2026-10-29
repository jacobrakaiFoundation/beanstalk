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
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.notifications.AlertControlPolicy
import org.jacobrakaifoundation.beanstalk.notifications.AlertSettingsAction

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
            item {
                InformationBanner("Beanstalk is independent and is not affiliated with or endorsed by FDA. It is not medical advice.")
            }
        }
    }
}
