package org.jacobrakaifoundation.beanstalk.domain

import java.text.Normalizer
import java.util.Locale
import org.jacobrakaifoundation.beanstalk.data.model.WatchField
import org.jacobrakaifoundation.beanstalk.data.model.WatchMatch

object WatchMatcher {
    private val whitespace = Regex("\\s+")

    fun normalizeTerm(rawTerm: String): String = Normalizer
        .normalize(rawTerm, Normalizer.Form.NFKC)
        .lowercase(Locale.US)
        .trim()
        .replace(whitespace, " ")

    fun contains(rawTerm: String, text: String): Boolean {
        val term = normalizeTerm(rawTerm)
        if (term.isEmpty() || text.isEmpty()) return false
        val normalizedText = Normalizer.normalize(text, Normalizer.Form.NFKC)
        val expression = Regex(
            "(?<![\\p{L}\\p{N}\\p{M}])${Regex.escape(term)}(?![\\p{L}\\p{N}\\p{M}])",
            setOf(RegexOption.IGNORE_CASE),
        )
        return expression.containsMatchIn(normalizedText)
    }

    fun matches(terms: List<String>, fields: List<WatchField>): List<WatchMatch> = buildList {
        terms.forEach { rawTerm ->
            val term = normalizeTerm(rawTerm)
            if (term.isNotEmpty()) {
                fields.forEach { field ->
                    if (contains(term, field.text)) {
                        add(WatchMatch(term = term, field = field.name, evidence = field.text))
                    }
                }
            }
        }
    }

    fun excerpt(evidence: String, term: String, maximumLength: Int = 280): String {
        if (evidence.length <= maximumLength) return evidence
        val match = Regex(Regex.escape(term), RegexOption.IGNORE_CASE).find(evidence)
            ?: return evidence.take(maximumLength) + "…"
        val lower = (match.range.first - 90).coerceAtLeast(0)
        val upper = (match.range.last + 151).coerceAtMost(evidence.length)
        return buildString {
            if (lower > 0) append('…')
            append(evidence.substring(lower, upper))
            if (upper < evidence.length) append('…')
        }
    }
}
