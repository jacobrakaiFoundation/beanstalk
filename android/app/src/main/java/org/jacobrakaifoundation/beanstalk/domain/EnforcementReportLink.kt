package org.jacobrakaifoundation.beanstalk.domain

/**
 * FDA's enforcement-report app opens `?Event=` as the iRES recall event.
 * openFDA `event_id` is that id. A product row needs an iRES product id,
 * which an openFDA record does not contain.
 */
object EnforcementReportLink {
    private const val EVENT_URL = "https://www.accessdata.fda.gov/scripts/ires/index.cfm?Event="

    fun eventID(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty() || trimmed.length > 12 || trimmed[0] == '0') return null
        if (trimmed.any { it !in '0'..'9' }) return null
        return trimmed
    }

    fun url(rawEventID: String): String? = eventID(rawEventID)?.let { EVENT_URL + it }
}
