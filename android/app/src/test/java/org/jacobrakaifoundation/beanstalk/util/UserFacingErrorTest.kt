package org.jacobrakaifoundation.beanstalk.util

import org.jacobrakaifoundation.beanstalk.data.network.ApiException
import org.junit.Assert.assertEquals
import org.junit.Test

class UserFacingErrorTest {
    @Test
    fun `network never returns api response bodies`() {
        val error = ApiException(500, """{"secret":"leak"}""")
        assertEquals(
            "Try again.",
            UserFacingError.network(error, "Try again."),
        )
    }

    @Test
    fun `validation messages pass through`() {
        assertEquals(
            "Each term must contain 2–80 characters.",
            UserFacingError.message(
                IllegalArgumentException("Each term must contain 2–80 characters."),
                "fallback",
            ),
        )
    }
}
