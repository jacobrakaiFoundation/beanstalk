package org.jacobrakaifoundation.beanstalk.util

/** Maps failures to copy safe to show in the UI (no HTTP bodies or stack traces). */
object UserFacingError {
    fun message(throwable: Throwable, fallback: String): String {
        if (throwable is IllegalArgumentException) {
            return throwable.message?.takeIf { it.isNotBlank() } ?: fallback
        }
        return fallback
    }

    fun network(throwable: Throwable, fallback: String): String = fallback
}
