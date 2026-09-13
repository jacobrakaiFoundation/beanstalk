package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecord
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.domain.SourceDates
import org.jacobrakaifoundation.beanstalk.domain.WatchMatcher

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoticeDetailScreen(
    state: BeanstalkUiState,
    onBack: () -> Unit,
    onToggleSave: (RecallNotice) -> Unit,
) {
    val notice = state.selectedNotice
    val context = LocalContext.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Recall details") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    if (notice != null) {
                        val saved = "notice:${notice.id}" in state.savedIDs
                        IconButton(onClick = { onToggleSave(notice) }) {
                            Icon(
                                if (saved) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                                contentDescription = if (saved) "Remove this recall from saved items" else "Save this recall",
                            )
                        }
                        IconButton(onClick = { shareURL(context, notice.sourceURL) }) {
                            Icon(Icons.Outlined.Share, contentDescription = "Share this FDA announcement")
                        }
                    }
                },
            )
        },
    ) { padding ->
        when {
            notice != null -> NoticeContent(
                notice = notice,
                offlineMessage = state.selectedOfflineMessage,
                matchedTerm = state.selectedMatchTerm,
                matchedField = state.selectedMatchField,
                modifier = Modifier.padding(padding),
            )
            state.detailLoading -> Box(
                Modifier.fillMaxSize().padding(padding),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }
            else -> EmptyState(
                title = "Recall unavailable",
                message = state.detailError ?: "This recall announcement could not be opened.",
                icon = Icons.Outlined.Refresh,
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun NoticeContent(
    notice: RecallNotice,
    offlineMessage: String?,
    matchedTerm: String?,
    matchedField: String?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(18.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Outlined.Verified,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
                Text(
                    "FDA public recall announcement",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        offlineMessage?.let { item { InformationBanner(it, warning = true) } }
        if (!matchedTerm.isNullOrBlank()) {
            item { MatchEvidence(notice, matchedTerm, matchedField) }
        }
        item {
            Text(
                notice.title,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
        }
        item { SelectionContainer { Text(notice.summary, style = MaterialTheme.typography.bodyLarge) } }
        item { HorizontalDivider() }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                SourceFact("Product", notice.productDescription)
                SourceFact("Reason stated by FDA", notice.reasonForRecall)
                SourceFact("Company", notice.companyName)
                SourceFact("Classification", notice.classification)
                SourceFact("Status", notice.status)
                SourceFact("Distribution", notice.distribution)
                SourceFact("Lots or codes", notice.codeInfo)
            }
        }
        item { HorizontalDivider() }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                SourceFact("Published", SourceDates.display(notice.publicationDate))
                notice.recallInitiationDate?.let { SourceFact("Recall initiated", SourceDates.display(it)) }
                SourceFact("Retrieved by Beanstalk", SourceDates.display(notice.retrievedAt))
            }
        }
        item {
            InformationBanner(
                "Use the original FDA announcement before acting. Beanstalk does not determine whether a product is safe.",
                warning = true,
            )
        }
        item {
            Button(
                onClick = { openExternal(context, notice.sourceURL) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = null)
                Text("Open original FDA.gov announcement", modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
private fun MatchEvidence(notice: RecallNotice, term: String, field: String?) {
    val fieldLabel = when (field) {
        "title" -> "the title"
        "summary" -> "the FDA summary"
        "product", "productDescription" -> "the product description"
        "reason", "reasonForRecall" -> "the reason for recall"
        "company", "companyName" -> "the company name"
        "distribution" -> "the distribution wording"
        "lot or code", "codeInfo" -> "the lot or code information"
        else -> "the FDA announcement"
    }
    val evidence = when (field) {
        "title" -> notice.title
        "summary" -> notice.summary
        "product", "productDescription" -> notice.productDescription
        "reason", "reasonForRecall" -> notice.reasonForRecall
        "company", "companyName" -> notice.companyName
        "distribution" -> notice.distribution
        "lot or code", "codeInfo" -> notice.codeInfo
        else -> notice.searchableFields().firstOrNull { WatchMatcher.contains(term, it.text) }?.text
    }
    InformationBanner(
        text = buildString {
            append("Matched “$term” in $fieldLabel.")
            evidence?.takeIf { it.isNotBlank() }?.let { append("\n\n${WatchMatcher.excerpt(it, term)}") }
        },
        icon = Icons.Outlined.NotificationsActive,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EnforcementDetailScreen(
    state: BeanstalkUiState,
    onBack: () -> Unit,
    onToggleSave: (EnforcementRecord) -> Unit,
) {
    val record = state.selectedRecord
    val context = LocalContext.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Historical record") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    if (record != null) {
                        val saved = "enforcement:${record.id}" in state.savedIDs
                        IconButton(onClick = { onToggleSave(record) }) {
                            Icon(
                                if (saved) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                                contentDescription = if (saved) "Remove this record from saved items" else "Save this historical record",
                            )
                        }
                        IconButton(onClick = { shareURL(context, record.sourceURL) }) {
                            Icon(Icons.Outlined.Share, contentDescription = "Share this historical source")
                        }
                    }
                },
            )
        },
    ) { padding ->
        if (record == null) {
            EmptyState(
                "Historical record unavailable",
                "This saved or selected openFDA record could not be read.",
                Icons.Outlined.History,
                Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(18.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                item {
                    Text(
                        "HISTORICAL ENFORCEMENT ARCHIVE",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                    )
                }
                item {
                    Text(
                        record.productDescription.ifBlank { "Product description not provided" },
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier.semantics { heading() },
                    )
                }
                item {
                    InformationBanner(
                        "As published by openFDA. This snapshot is not a live FDA recall lifecycle feed; statuses may remain Ongoing after a recall ends.",
                        icon = Icons.Outlined.History,
                    )
                }
                item { HorizontalDivider() }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        SourceFact("Reason for recall", record.reasonForRecall)
                        SourceFact("Recalling firm", record.recallingFirm)
                        SourceFact("Classification", record.rawClassification?.takeIf { it.isNotBlank() } ?: record.classification)
                        SourceFact("Status", record.rawStatus?.takeIf { it.isNotBlank() } ?: record.status)
                        SourceFact("Distribution", record.distributionPattern)
                        SourceFact("Lots or codes", record.codeInfo)
                        SourceFact("Additional lot or code information", record.moreCodeInfo)
                        SourceFact("Product quantity", record.productQuantity)
                    }
                }
                item { HorizontalDivider() }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        SourceFact("Recall number", record.recallNumber)
                        SourceFact("Event ID", record.eventID)
                        SourceFact("Published in openFDA", SourceDates.display(record.publicationDate))
                        SourceFact("Recall initiated", SourceDates.display(record.recallInitiationDate))
                        SourceFact("Retrieved by Beanstalk", SourceDates.display(record.retrievedAt))
                        SourceFact("Classification date", SourceDates.display(record.centerClassificationDate))
                        SourceFact("Termination date", SourceDates.display(record.terminationDate))
                        SourceFact("Voluntary or mandated", record.voluntaryMandated)
                        SourceFact("Initial firm notification", record.initialFirmNotification)
                        SourceFact("City", record.city)
                        SourceFact("State", record.state)
                        SourceFact("Country", record.country)
                        SourceFact("Address", listOf(record.address1, record.address2, record.postalCode).filter { it.isNotBlank() }.joinToString(", "))
                    }
                }
                item {
                    InformationBanner(
                        "No record or status in this archive establishes that a product is safe. Verify current information with FDA.",
                        warning = true,
                    )
                }
                item {
                    Button(onClick = { openExternal(context, record.sourceURL) }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = null)
                        Text("Open raw openFDA.gov source", modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        }
    }
}
