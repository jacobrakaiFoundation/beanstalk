package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddAlert
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.domain.WatchMatcher

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistScreen(
    state: BeanstalkUiState,
    onAddTerm: (String, () -> Unit) -> Unit,
    onRemoveTerm: (String) -> Unit,
    onRequestNotifications: () -> Unit,
    onNotice: (RecallNotice, String?, String?) -> Unit,
) {
    var newTerm by rememberSaveable { mutableStateOf("") }
    val submit = {
        val normalized = WatchMatcher.normalizeTerm(newTerm)
        val locallyValid = normalized.length in 2..80 &&
            normalized !in state.watchTerms.map { it.normalizedTerm } &&
            state.watchTerms.size < 20
        onAddTerm(newTerm, onRequestNotifications)
        if (locallyValid) newTerm = ""
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Watchlist") }) }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                InformationBanner(
                    "Matches use case-insensitive whole words or exact phrases and show where each match occurred. A match does not determine dietary safety.",
                    icon = Icons.Outlined.Search,
                )
            }
            item {
                SectionHeading("Add a watch term")
                Column(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = newTerm,
                        onValueChange = { newTerm = it },
                        label = { Text("Example: peanut butter") },
                        supportingText = { Text("2–80 characters · up to 20 terms") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { submit() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = submit,
                        enabled = WatchMatcher.normalizeTerm(newTerm).length in 2..80 && state.watchTerms.size < 20,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Add watch term") }
                }
                state.watchValidation?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
            }
            item { SectionHeading("Watching") }
            if (state.watchTerms.isEmpty()) {
                item { Text("No watch terms yet", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                items(state.watchTerms, key = { it.normalizedTerm }) { term ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = CardDefaults.outlinedCardBorder(),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 5.dp, bottom = 5.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(modifier = Modifier.weight(1f).padding(vertical = 12.dp)) {
                                Icon(Icons.Outlined.NotificationsNone, contentDescription = null)
                                Text(term.normalizedTerm, modifier = Modifier.padding(start = 10.dp))
                            }
                            IconButton(onClick = { onRemoveTerm(term.normalizedTerm) }) {
                                Icon(Icons.Outlined.DeleteOutline, contentDescription = "Stop watching ${term.normalizedTerm}")
                            }
                        }
                    }
                }
            }
            item {
                SectionHeading("Alert status")
                InformationBanner(
                    state.notificationState.message,
                    icon = if (state.notificationState.alertsEnabled) Icons.Outlined.AddAlert else Icons.Outlined.NotificationsNone,
                    modifier = Modifier.padding(top = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            if (state.watchTerms.isNotEmpty()) {
                item { SectionHeading("Matches in recent announcements") }
                state.watchMessage?.let { item { InformationBanner(it, warning = true) } }
                if (state.watchMatches.isEmpty()) {
                    item {
                        InformationBanner(
                            "No recent loaded announcement matches these terms. This does not mean a product is safe or that every FDA announcement has been received.",
                            warning = true,
                        )
                    }
                } else {
                    items(state.watchMatches, key = { it.notice.id }) { result ->
                        Card(
                            onClick = {
                                val first = result.matches.firstOrNull()
                                onNotice(result.notice, first?.term, first?.field)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            border = CardDefaults.outlinedCardBorder(),
                        ) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    result.notice.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 3,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                result.matches.take(3).forEach { match ->
                                    Column {
                                        Text(
                                            "“${match.term}” in ${match.field}",
                                            style = MaterialTheme.typography.labelLarge,
                                            color = MaterialTheme.colorScheme.primary,
                                            fontWeight = FontWeight.Bold,
                                        )
                                        Text(
                                            WatchMatcher.excerpt(match.evidence, match.term, 180),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 3,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
