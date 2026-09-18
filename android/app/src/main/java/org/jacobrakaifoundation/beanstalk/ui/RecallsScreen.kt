package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.outlined.FilterAlt
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecord

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecallsScreen(
    state: BeanstalkUiState,
    onModeChange: (BrowseMode) -> Unit,
    onQueryChange: (String) -> Unit,
    onClassificationChange: (String) -> Unit,
    onStatusChange: (String) -> Unit,
    onSearch: () -> Unit,
    onLoadMore: () -> Unit,
    onRecord: (EnforcementRecord) -> Unit,
) {
    Scaffold(
        contentWindowInsets = tabScaffoldInsets(),
        topBar = {
            TopAppBar(
                title = { Text("Recalls") },
                actions = {
                    IconButton(onClick = onSearch) {
                        Icon(Icons.Outlined.Refresh, contentDescription = "Refresh recall records")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { BeanstalkHeader() }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BrowseMode.entries.forEach { mode ->
                        FilterChip(
                            selected = state.mode == mode,
                            onClick = { onModeChange(mode) },
                            label = { Text(mode.label) },
                            leadingIcon = if (mode == BrowseMode.HISTORICAL) {
                                { Icon(Icons.Outlined.History, contentDescription = null) }
                            } else {
                                { Icon(Icons.Outlined.WarningAmber, contentDescription = null) }
                            },
                        )
                    }
                }
            }
            item {
                InformationBanner(
                    text = if (state.mode == BrowseMode.LATEST) {
                        "Latest results are the newest openFDA food-enforcement snapshots, sorted by report date. This archive can lag fda.gov and is not a live FDA announcement feed."
                    } else {
                        "Historical results are openFDA enforcement snapshots. FDA discourages using this archive for public alerts."
                    },
                    icon = if (state.mode == BrowseMode.HISTORICAL) Icons.Outlined.History else Icons.Outlined.WarningAmber,
                )
            }
            item {
                OutlinedTextField(
                    value = state.query,
                    onValueChange = onQueryChange,
                    label = { Text(if (state.mode == BrowseMode.LATEST) "Search recent enforcement records" else "Search historical records") },
                    placeholder = { Text("Product, hazard, or company") },
                    leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                    trailingIcon = {
                        IconButton(onClick = onSearch) { Icon(Icons.Outlined.Search, contentDescription = "Search") }
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { onSearch() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (state.query != state.submittedQuery) {
                item {
                    Text(
                        if (state.submittedQuery.isBlank()) "Showing all results. Submit Search to apply your changes."
                        else "Showing results for “${state.submittedQuery}”. Submit Search to apply your changes.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            if (state.mode == BrowseMode.HISTORICAL) {
                item {
                    HistoricalFilters(
                        classification = state.classification,
                        status = state.status,
                        onClassificationChange = onClassificationChange,
                        onStatusChange = onStatusChange,
                    )
                }
            }
            state.offlineMessage?.let { message ->
                item { InformationBanner(message, warning = true) }
            }
            state.errorMessage?.let { message ->
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { liveRegion = LiveRegionMode.Polite },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        InformationBanner(message, warning = true)
                        OutlinedButton(onClick = onSearch) { Text("Try again") }
                    }
                }
            }
            if (!state.isLoading && state.errorMessage == null && state.records.isEmpty()) {
                item {
                    EmptyState(
                        if (state.mode == BrowseMode.LATEST) "No matching recent records" else "No matching historical records",
                        "No match means only that openFDA returned no matching enforcement snapshot. It does not mean a product is safe.",
                        Icons.Outlined.Search,
                    )
                }
            }
            items(state.records, key = { it.id }) { record -> EnforcementRow(record, { onRecord(record) }) }
            if (state.archiveHasMore) item { LoadMoreButton(state.isLoading, onLoadMore) }
            if (state.isLoading && state.notices.isEmpty() && state.records.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoricalFilters(
    classification: String,
    status: String,
    onClassificationChange: (String) -> Unit,
    onStatusChange: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilterMenu(
            label = classification.ifBlank { "Any class" },
            options = listOf("" to "Any class", "Class I" to "Class I", "Class II" to "Class II", "Class III" to "Class III", "Not Yet Classified" to "Not yet classified"),
            onSelect = onClassificationChange,
            modifier = Modifier.fillMaxWidth(),
        )
        FilterMenu(
            label = status.ifBlank { "Any status" },
            options = listOf("" to "Any status", "Ongoing" to "Ongoing", "Completed" to "Completed", "Terminated" to "Terminated"),
            onSelect = onStatusChange,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun FilterMenu(
    label: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.FilterAlt, contentDescription = null)
            Text(label)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (value, display) ->
                DropdownMenuItem(
                    text = { Text(display) },
                    onClick = {
                        expanded = false
                        onSelect(value)
                    },
                )
            }
        }
    }
}

@Composable
private fun LoadMoreButton(isLoading: Boolean, onLoadMore: () -> Unit) {
    Button(onClick = onLoadMore, enabled = !isLoading, modifier = Modifier.fillMaxWidth()) {
        if (isLoading) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
        Text(if (isLoading) "Loading…" else "Load more")
    }
}
