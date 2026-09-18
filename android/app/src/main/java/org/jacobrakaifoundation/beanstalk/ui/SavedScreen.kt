package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
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
    Scaffold(
        contentWindowInsets = tabScaffoldInsets(),
        topBar = { TopAppBar(title = { Text("Saved") }) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                InformationBanner("Saved copies can become outdated. Verify the original FDA notice before acting.")
            }
            if (state.saved.isEmpty()) {
                item { EmptyState("No saved records", "Save a notice or historical record to keep a local copy.", Icons.Outlined.BookmarkBorder) }
            }
            items(state.saved, key = { it.stableID }) { item ->
                Column(
                    modifier = Modifier.fillMaxWidth().clickable { onOpen(item) },
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(item.title, style = MaterialTheme.typography.titleMedium)
                    Text(item.subtitle, style = MaterialTheme.typography.bodyMedium)
                    OutlinedButton(onClick = { onRemove(item) }) { Text("Remove") }
                }
            }
        }
    }
}
