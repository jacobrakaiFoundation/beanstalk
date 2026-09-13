package org.jacobrakaifoundation.beanstalk.ui

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.DeleteForever
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Policy
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.BuildConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    state: BeanstalkUiState,
    onRequestNotifications: () -> Unit,
    onDisableNotifications: () -> Unit,
    onClearLocalData: () -> Unit,
) {
    val context = LocalContext.current
    var confirmDisable by remember { mutableStateOf(false) }
    var confirmClear by remember { mutableStateOf(false) }

    Scaffold(topBar = { TopAppBar(title = { Text("Settings") }) }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item {
                BeanstalkHeader()
                Text(
                    "Beanstalk is free. Every search, saved record, watch term, and alert feature is available without payment.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
            item {
                SettingsSection("Notifications") {
                    InformationBanner(state.notificationState.message, icon = Icons.Outlined.NotificationsNone)
                    OutlinedButton(
                        onClick = {
                            context.startActivity(
                                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                    .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Open Android notification settings") }
                    if (state.watchTerms.isNotEmpty() && !state.notificationState.alertsEnabled) {
                        Button(onClick = onRequestNotifications, modifier = Modifier.fillMaxWidth()) {
                            Text("Turn on alerts for this watchlist")
                        }
                    }
                    if (state.notificationState.alertsEnabled) {
                        TextButton(onClick = { confirmDisable = true }, modifier = Modifier.fillMaxWidth()) {
                            Text("Remove this device from Beanstalk alerts", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
            item {
                SettingsSection("Data on this device") {
                    SettingValue("Saved recalls", state.saved.size.toString())
                    SettingValue("Watch terms", state.watchTerms.size.toString())
                    OutlinedButton(
                        onClick = { confirmClear = true },
                        enabled = state.saved.isNotEmpty() || state.watchTerms.isNotEmpty(),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.DeleteForever, contentDescription = null)
                        Text("Clear all local Beanstalk data", modifier = Modifier.padding(start = 8.dp))
                    }
                    state.localDataMessage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                }
            }
            item {
                SettingsSection("Support the Foundation") {
                    Text("Donations are optional. Donating unlocks nothing in Beanstalk and does not change recall results or alerts.")
                    Button(
                        onClick = { openExternal(context, "https://jacobrakai.org/donate/") },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.FavoriteBorder, contentDescription = null)
                        Text("Donate to JACOBRAKAI FOUNDATION", modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
            item {
                SettingsSection("Official sources") {
                    Text("Latest recalls use FDA public recall announcements. Historical search uses openFDA enforcement snapshots as published.")
                    ExternalSettingLink("FDA food recalls (.gov)", "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts")
                    ExternalSettingLink("openFDA food enforcement API (.gov)", "https://open.fda.gov/apis/food/enforcement/")
                    ExternalSettingLink("USDA FSIS recalls (.gov)", "https://www.fsis.usda.gov/recalls")
                }
            }
            item {
                SettingsSection("Independence and health information") {
                    InformationBanner(
                        "Beanstalk is independent. It is not affiliated with, endorsed by, or representing the FDA, USDA, or U.S. government.",
                        icon = Icons.Outlined.Public,
                    )
                    InformationBanner(
                        "Beanstalk is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a healthcare professional for medical advice, diagnosis, or treatment.",
                        icon = Icons.Outlined.Policy,
                        warning = true,
                    )
                    Text("No search result means only that no matching record was found. It never means a product is safe.")
                }
            }
            item {
                SettingsSection("Help and privacy") {
                    ExternalSettingLink("Privacy policy", "https://jacobrakaifoundation.github.io/beanstalk/privacy.html")
                    ExternalSettingLink("Support", "https://jacobrakaifoundation.github.io/beanstalk/support.html")
                }
            }
            item {
                SettingsSection("App") {
                    SettingValue("Version", BuildConfig.VERSION_NAME)
                    SettingValue("Availability", "United States · English")
                }
            }
        }
    }

    if (confirmDisable) {
        AlertDialog(
            onDismissRequest = { confirmDisable = false },
            title = { Text("Remove this device from alerts?") },
            text = { Text("Beanstalk will delete this device's server registration. Your watchlist remains on this device.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDisable = false
                    onDisableNotifications()
                }) { Text("Remove device") }
            },
            dismissButton = { TextButton(onClick = { confirmDisable = false }) { Text("Cancel") } },
        )
    }
    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Clear Beanstalk data?") },
            text = { Text("This removes saved recall copies, watch terms, and cached results from this device. It cannot be undone.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmClear = false
                    onClearLocalData()
                }) { Text("Clear local data") }
            },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionHeading(title)
        content()
        HorizontalDivider(modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun SettingValue(label: String, value: String) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(label)
        Text(value, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun ExternalSettingLink(label: String, url: String) {
    val context = LocalContext.current
    OutlinedButton(onClick = { openExternal(context, url) }, modifier = Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = "Opens external browser")
    }
}
