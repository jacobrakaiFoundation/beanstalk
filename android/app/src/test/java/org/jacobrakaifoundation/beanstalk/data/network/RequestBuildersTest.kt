package org.jacobrakaifoundation.beanstalk.data.network

import org.jacobrakaifoundation.beanstalk.data.model.EnforcementSearch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RequestBuildersTest {
    @Test
    fun `notice request bounds limit and sanitizes query`() {
        val url = RequestBuilders.notices(
            baseURL = "https://api.beanstalk.jacobrakai.org",
            limit = 1_000,
            cursor = "next page",
            query = "  cheese\\\"  ",
        )

        assertEquals("100", url.queryParameter("limit"))
        assertEquals("next page", url.queryParameter("cursor"))
        assertEquals("cheese", url.queryParameter("query"))
    }

    @Test
    fun `historical filters are composed before pagination`() {
        val url = RequestBuilders.enforcement(
            EnforcementSearch(
                query = "almond",
                classification = "Class I",
                status = "Ongoing",
                limit = 25,
                page = 3,
            ),
        )
        val search = requireNotNull(url.queryParameter("search"))

        assertTrue(search.contains("product_description:\"almond\""))
        assertTrue(search.contains("classification:\"Class I\""))
        assertTrue(search.contains("status:\"Ongoing\""))
        assertEquals("25", url.queryParameter("limit"))
        assertEquals("75", url.queryParameter("skip"))
        assertTrue(url.queryParameterNames.toList().indexOf("search") < url.queryParameterNames.toList().indexOf("limit"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `historical pagination refuses openFDA offset beyond limit`() {
        RequestBuilders.enforcement(EnforcementSearch(limit = 100, page = 251))
    }
}
