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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Storage
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.data.model.SavedRecall

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavedScreen(
    state: BeanstalkUiState,
    onOpen: (SavedRecall) -> Unit,
    onRemove: (SavedRecall) -> Unit,
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Saved") }) }) { padding ->
        if (state.saved.isEmpty()) {
            EmptyState(
                "No saved recalls",
                "Save a current announcement or historical record to keep an offline copy on this device.",
                Icons.Outlined.BookmarkBorder,
                Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    InformationBanner(
                        "Saved copies may become outdated. Open the original source in each record before acting.",
                        icon = Icons.Outlined.Storage,
                    )
                }
                items(state.saved, key = { it.stableID }) { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.weight(1f)) { SavedRow(item, { onOpen(item) }) }
                        IconButton(onClick = { onRemove(item) }) {
                            Icon(Icons.Outlined.DeleteOutline, contentDescription = "Remove ${item.title} from saved items")
                        }
                    }
                }
            }
        }
    }
}
