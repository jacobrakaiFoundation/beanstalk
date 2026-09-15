package org.jacobrakaifoundation.beanstalk.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

object SourceDates {
    private val compact = DateTimeFormatter.ofPattern("yyyyMMdd")
    private val display = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

    fun display(sourceValue: String): String {
        if (sourceValue.isBlank()) return "Not provided"
        if (sourceValue.matches(Regex("^\\d{8}$"))) {
            return runCatching { LocalDate.parse(sourceValue, compact).format(display) }
                .getOrDefault(sourceValue)
        }
        return parseInstant(sourceValue)
            ?.atZone(ZoneId.systemDefault())
            ?.toLocalDate()
            ?.format(display)
            ?: sourceValue
    }

    fun displayEpoch(epochMillis: Long): String =
        Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).toLocalDate().format(display)

    private fun parseInstant(value: String): Instant? = try {
        Instant.parse(value)
    } catch (_: DateTimeParseException) {
        try {
            Instant.parse(value.replace(Regex("\\.\\d+Z$"), "Z"))
        } catch (_: DateTimeParseException) {
            null
        }
    }
}
