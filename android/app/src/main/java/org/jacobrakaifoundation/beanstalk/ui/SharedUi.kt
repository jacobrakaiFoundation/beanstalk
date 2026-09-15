package org.jacobrakaifoundation.beanstalk.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementRecord
import org.jacobrakaifoundation.beanstalk.data.model.RecallNotice
import org.jacobrakaifoundation.beanstalk.domain.SourceDates

@Composable
fun BeanstalkHeader() {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Beanstalk", style = MaterialTheme.typography.headlineMedium)
        Text("Published food recall records", style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun InformationBanner(
    text: String,
    icon: ImageVector? = null,
    warning: Boolean = false,
) {
    Surface(
        color = if (warning) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text,
            modifier = Modifier.padding(12.dp).semantics(mergeDescendants = true) {},
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
fun EmptyState(title: String, body: String, icon: ImageVector) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 16.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(body, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun RecallRow(notice: RecallNotice, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("FDA announcement", style = MaterialTheme.typography.labelMedium)
            Text(SourceDates.display(notice.publicationDate), style = MaterialTheme.typography.labelSmall)
        }
        Text(notice.title, style = MaterialTheme.typography.titleMedium)
        notice.companyName?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun EnforcementRow(record: EnforcementRecord, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(record.classification, style = MaterialTheme.typography.labelMedium)
            Text(SourceDates.display(record.publicationDate), style = MaterialTheme.typography.labelSmall)
        }
        Text(
            record.productDescription.ifBlank { "Product description not provided" },
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            record.recallingFirm.ifBlank { "Recalling firm not provided" },
            style = MaterialTheme.typography.bodyMedium,
        )
        Text("As published by openFDA", style = MaterialTheme.typography.bodySmall)
    }
}
