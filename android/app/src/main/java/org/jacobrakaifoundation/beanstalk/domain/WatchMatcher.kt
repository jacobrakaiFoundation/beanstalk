package org.jacobrakaifoundation.beanstalk.domain

import java.text.Normalizer
import java.util.Locale
import org.jacobrakaifoundation.beanstalk.data.model.WatchField
import org.jacobrakaifoundation.beanstalk.data.model.WatchMatch

object WatchMatcher {
    fun normalizeTerm(term: String): String =
        Normalizer.normalize(term, Normalizer.Form.NFKC)
            .lowercase(Locale.US)
            .split(Regex("\\s+"))
            .filter { it.isNotEmpty() }
            .joinToString(" ")

    fun contains(term: String, text: String): Boolean {
        val normalizedTerm = normalizeTerm(term)
        if (normalizedTerm.isEmpty() || text.isEmpty()) return false
        val normalizedText = Normalizer.normalize(text, Normalizer.Form.NFKC).lowercase(Locale.US)
        val pattern = "(?<![\\p{L}\\p{N}\\p{M}])${Regex.escape(normalizedTerm)}(?![\\p{L}\\p{N}\\p{M}])"
        return Regex(pattern, RegexOption.IGNORE_CASE).containsMatchIn(normalizedText)
    }

    fun matches(terms: List<String>, fields: List<WatchField>): List<WatchMatch> {
        val results = mutableListOf<WatchMatch>()
        for (rawTerm in terms) {
            val term = normalizeTerm(rawTerm)
            if (term.isEmpty()) continue
            for (field in fields) {
                if (contains(term, field.text)) {
                    results += WatchMatch(term, field.name, field.text)
                }
            }
        }
        return results
    }
}
