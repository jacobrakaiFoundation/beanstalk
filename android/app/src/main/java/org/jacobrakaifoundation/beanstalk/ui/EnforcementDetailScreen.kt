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
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecord
import org.jacobrakaifoundation.beanstalk.domain.SourceDates

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EnforcementDetailScreen(
    state: BeanstalkUiState,
    onBack: () -> Boolean,
    onToggleSave: (EnforcementRecord) -> Unit,
) {
    val record = state.selectedRecord
    val uriHandler = LocalUriHandler.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Historical record") },
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
            InformationBanner("Historical results are openFDA enforcement snapshots, not a live FDA alert feed.")
            if (record != null) {
                val saved = "enforcement:${record.id}" in state.savedIDs
                Text(
                    record.productDescription.ifBlank { "Product description not provided" },
                    style = MaterialTheme.typography.headlineSmall,
                )
                SourceFact("Reason", record.reasonForRecall)
                SourceFact("Company", record.recallingFirm)
                SourceFact("Classification", record.classification)
                SourceFact("Status", record.status)
                SourceFact("Distribution", record.distributionPattern)
                SourceFact("Lot or code", listOf(record.codeInfo, record.moreCodeInfo).filter { it.isNotBlank() }.joinToString(" "))
                SourceFact("Published in openFDA", SourceDates.display(record.publicationDate))
                TextButton(onClick = { uriHandler.openUri(record.sourceURL) }) { Text("Open openFDA source") }
                TextButton(onClick = { onToggleSave(record) }) {
                    Text(if (saved) "Remove saved copy" else "Save a local copy")
                }
            }
        }
    }
}
