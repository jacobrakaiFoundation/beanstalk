package org.jacobrakaifoundation.beanstalk.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

object SourceDates {
    private val compact = DateTimeFormatter.BASIC_ISO_DATE
    private val display = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(Locale.US)

    fun display(sourceValue: String?): String {
        if (sourceValue.isNullOrBlank()) return "Not provided"
        return runCatching { LocalDate.parse(sourceValue, compact).format(display) }
            .recoverCatching {
                Instant.parse(sourceValue).atZone(ZoneId.systemDefault()).toLocalDate().format(display)
            }
            .getOrDefault(sourceValue)
    }

    fun displayEpoch(epochMillis: Long): String = Instant.ofEpochMilli(epochMillis)
        .atZone(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(Locale.US))
}
