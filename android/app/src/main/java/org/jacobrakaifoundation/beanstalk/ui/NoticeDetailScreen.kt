package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.domain.SourceDates

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoticeDetailScreen(
    state: BeanstalkUiState,
    onBack: () -> Boolean,
    onToggleSave: (RecallNotice) -> Unit,
) {
    val notice = state.selectedNotice
    val uriHandler = LocalUriHandler.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Announcement") },
                navigationIcon = {
                    IconButton(onClick = { onBack() }) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.detailLoading) {
                Text("Loading announcement…")
            }
            state.detailError?.let { InformationBanner(it, warning = true) }
            state.selectedOfflineMessage?.let { InformationBanner(it, warning = true) }
            if (notice != null) {
                val saved = "notice:${notice.id}" in state.savedIDs
                Text(notice.title, style = MaterialTheme.typography.headlineSmall)
                if (!state.selectedMatchTerm.isNullOrBlank()) {
                    InformationBanner("Matched “${state.selectedMatchTerm}” in ${state.selectedMatchField ?: "this announcement"}")
                }
                Text(notice.summary, style = MaterialTheme.typography.bodyMedium)
                SourceFact("Product", notice.productDescription)
                SourceFact("Hazard", notice.reasonForRecall)
                SourceFact("Company", notice.companyName)
                SourceFact("Classification", notice.classification)
                SourceFact("Status", notice.status)
                SourceFact("Distribution", notice.distribution)
                SourceFact("Lot or code", notice.codeInfo)
                SourceFact("Published", SourceDates.display(notice.publicationDate))
                TextButton(onClick = { uriHandler.openUri(notice.sourceURL) }) { Text("Open FDA source") }
                TextButton(onClick = { onToggleSave(notice) }) {
                    Text(if (saved) "Remove saved copy" else "Save a local copy")
                }
            }
        }
    }
}

@Composable
fun SourceFact(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
