package org.jacobrakaifoundation.beanstalk.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EnforcementReportLinkTest {
    @Test
    fun `numeric event id opens the FDA enforcement report`() {
        assertEquals(
            "https://www.accessdata.fda.gov/scripts/ires/index.cfm?Event=100041",
            EnforcementReportLink.url(" 100041 "),
        )
    }

    @Test
    fun `missing or non-numeric event ids are not enforcement report links`() {
        assertNull(EnforcementReportLink.url(""))
        assertNull(EnforcementReportLink.url("F-100-2026"))
        assertNull(EnforcementReportLink.url("0100041"))
        assertNull(EnforcementReportLink.url("1000410000000"))
    }
}
