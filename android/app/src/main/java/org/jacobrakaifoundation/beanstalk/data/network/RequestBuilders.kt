package org.jacobrakaifoundation.beanstalk.data.network

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.jacobrakaifoundation.beanstalk.data.model.EnforcementSearch

object RequestBuilders {
    fun notices(baseURL: String, limit: Int, cursor: String?, query: String?): HttpUrl {
        val builder = baseURL.trimEnd('/').toHttpUrl().newBuilder()
            .addPathSegments("v1/notices")
            .addQueryParameter("limit", limit.coerceIn(1, 100).toString())
        cursor?.takeIf { it.isNotBlank() }?.let { builder.addQueryParameter("cursor", it) }
        sanitize(query.orEmpty()).take(120).takeIf { it.isNotBlank() }
            ?.let { builder.addQueryParameter("query", it) }
        return builder.build()
    }

    fun noticeDetail(baseURL: String, id: String): HttpUrl = baseURL.trimEnd('/').toHttpUrl().newBuilder()
        .addPathSegments("v1/notices")
        .addPathSegment(id)
        .build()

    fun enforcement(search: EnforcementSearch): HttpUrl {
        require(search.skip <= 25_000) { "openFDA pagination cannot exceed a 25,000 record offset" }
        val predicates = buildList {
            sanitize(search.query).takeIf { it.isNotBlank() }?.let {
                add("(product_description:\"$it\" OR reason_for_recall:\"$it\" OR recalling_firm:\"$it\")")
            }
            sanitize(search.classification).takeIf { it.isNotBlank() }
                ?.let { add("classification:\"$it\"") }
            sanitize(search.status).takeIf { it.isNotBlank() }
                ?.let { add("status:\"$it\"") }
        }
        return "https://api.fda.gov/food/enforcement.json".toHttpUrl().newBuilder().apply {
            if (predicates.isNotEmpty()) addQueryParameter("search", predicates.joinToString(" AND "))
            // Every filter is in the server-side predicate before pagination is applied.
            addQueryParameter("limit", search.limit.coerceIn(1, 100).toString())
            addQueryParameter("skip", search.skip.toString())
        }.build()
    }

    fun sanitize(value: String): String = value
        .replace("\"", "")
        .replace("\\", "")
        .trim()
}
