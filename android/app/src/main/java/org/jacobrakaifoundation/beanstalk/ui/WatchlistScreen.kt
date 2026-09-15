package org.jacobrakaifoundation.beanstalk.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.data.model.NoticeWatchResult
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.data.model.WatchTerm
import org.jacobrakaifoundation.beanstalk.notifications.AlertControlPolicy

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistScreen(
    state: BeanstalkUiState,
    onDismiss: () -> Unit,
    onAddTerm: (String, () -> Unit) -> Unit,
    onRemoveTerm: (String) -> Unit,
    onRequestNotifications: () -> Unit,
    onNotice: (RecallNotice, String, String) -> Unit,
) {
    var draft by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val dismiss = {
        keyboard?.hide()
        focusManager.clearFocus()
        onDismiss()
    }
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
    val submitDraft = {
        onAddTerm(draft, requestAlertsIfAvailable)
        draft = ""
        keyboard?.hide()
        focusManager.clearFocus()
    }
    BackHandler(onBack = dismiss)
    Scaffold(
        contentWindowInsets = tabScaffoldInsets(),
        topBar = {
            TopAppBar(
                title = { Text("Watchlist") },
                navigationIcon = {
                    IconButton(onClick = dismiss) {
                        Icon(Icons.Outlined.Close, contentDescription = "Close watchlist")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                InformationBanner(
                    "Matches use case-insensitive whole words or exact phrases and show where each match occurred. A match does not determine dietary safety.",
                )
            }
            item { Text("Alert status", style = MaterialTheme.typography.titleMedium) }
            item { InformationBanner(state.notificationState.message) }
            item { Text("Add a watch term", style = MaterialTheme.typography.titleMedium) }
            item {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    label = { Text("Example: peanut butter") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submitDraft() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Button(
                    onClick = submitDraft,
                    enabled = draft.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Add term") }
            }
            item {
                Text("2–80 characters per term · up to 20 terms", style = MaterialTheme.typography.bodySmall)
            }
            state.watchValidation?.let { item { InformationBanner(it, warning = true) } }
            item { Text("Watching", style = MaterialTheme.typography.titleMedium) }
            if (state.watchTerms.isEmpty()) {
                item {
                    EmptyState(
                        "No watch terms yet",
                        "Add a word or exact phrase to check recent announcements.",
                        Icons.Outlined.NotificationsNone,
                    )
                }
            } else {
                items(state.watchTerms, key = { it.normalizedTerm }) { term ->
                    WatchTermRow(term, onRemoveTerm)
                }
            }
            if (state.watchTerms.isNotEmpty()) {
                item { Text("Matches in recent announcements", style = MaterialTheme.typography.titleMedium) }
                state.watchMessage?.let { item { InformationBanner(it, warning = true) } }
                if (state.watchMatches.isEmpty()) {
                    item {
                        EmptyState(
                            "No recent loaded announcement matches these terms.",
                            "This does not mean a product is safe or that every FDA announcement has been received.",
                            Icons.Outlined.NotificationsNone,
                        )
                    }
                } else {
                    items(state.watchMatches, key = { it.notice.id }) { match ->
                        WatchMatchRow(match, onNotice)
                    }
                }
            }
        }
    }
}

@Composable
private fun WatchTermRow(term: WatchTerm, onRemoveTerm: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            term.normalizedTerm,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = { onRemoveTerm(term.normalizedTerm) }) {
            Icon(Icons.Outlined.Close, contentDescription = "Remove ${term.normalizedTerm}")
        }
    }
}

@Composable
private fun WatchMatchRow(
    match: NoticeWatchResult,
    onNotice: (RecallNotice, String, String) -> Unit,
) {
    val first = match.matches.first()
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        RecallRow(match.notice) { onNotice(match.notice, first.term, first.field) }
        match.matches.take(3).forEach { hit ->
            Text(
                "“${hit.term}” in ${hit.field}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
