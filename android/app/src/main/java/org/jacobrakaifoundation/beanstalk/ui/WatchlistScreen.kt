package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.notifications.AlertControlPolicy

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistScreen(
    state: BeanstalkUiState,
    onAddTerm: (String, () -> Unit) -> Unit,
    onRemoveTerm: (String) -> Unit,
    onRequestNotifications: () -> Unit,
    onNotice: (RecallNotice, String, String) -> Unit,
) {
    var draft by remember { mutableStateOf("") }
    val requestAlertsIfAvailable = {
        if (
            AlertControlPolicy.shouldOfferEnable(
                state.notificationState.alertsEnabled,
                state.notificationState.alertsAvailable,
            )
        ) {
            onRequestNotifications()
        }
    }
    Scaffold(topBar = { TopAppBar(title = { Text("Watchlist") }) }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                InformationBanner(state.notificationState.message)
            }
            item {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    label = { Text("Add a watch term") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = {
                        onAddTerm(draft, requestAlertsIfAvailable)
                        draft = ""
                    }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Button(
                    onClick = {
                        onAddTerm(draft, requestAlertsIfAvailable)
                        draft = ""
                    },
                    enabled = draft.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Add term") }
            }
            state.watchValidation?.let { item { InformationBanner(it, warning = true) } }
            items(state.watchTerms, key = { it.normalizedTerm }) { term ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(term.normalizedTerm, style = MaterialTheme.typography.titleMedium)
                    OutlinedButton(onClick = { onRemoveTerm(term.normalizedTerm) }) { Text("Remove") }
                }
            }
            state.watchMessage?.let { item { InformationBanner(it, warning = true) } }
            items(state.watchMatches, key = { it.notice.id }) { match ->
                val first = match.matches.first()
                RecallRow(match.notice) { onNotice(match.notice, first.term, first.field) }
            }
        }
    }
}
