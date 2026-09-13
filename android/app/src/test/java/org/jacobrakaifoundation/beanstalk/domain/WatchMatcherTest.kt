package org.jacobrakaifoundation.beanstalk.domain

import org.jacobrakaifoundation.beanstalk.data.model.WatchField
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchMatcherTest {
    @Test
    fun `matches are case insensitive whole words`() {
        assertTrue(WatchMatcher.contains("salmonella", "Risk of SALMONELLA contamination"))
        assertFalse(WatchMatcher.contains("salmon", "Risk of salmonella contamination"))
        assertFalse(WatchMatcher.contains("cod", "Use product code 88"))
        assertTrue(WatchMatcher.contains("cod", "Frozen cod fillets"))
    }

    @Test
    fun `exact phrases match across normalized input spacing`() {
        assertTrue(WatchMatcher.contains("  peanut   butter ", "Undeclared peanut butter allergen"))
        assertFalse(WatchMatcher.contains("peanut butter", "Peanut and almond butter assortment"))
    }

    @Test
    fun `punctuation creates boundaries but letters and numbers do not`() {
        assertTrue(WatchMatcher.contains("milk", "Contains: milk, soy"))
        assertTrue(WatchMatcher.contains("lot-12", "Affected LOT-12."))
        assertFalse(WatchMatcher.contains("lot", "Affected LOT12."))
    }

    @Test
    fun `matching preserves source evidence and field name`() {
        val fields = listOf(
            WatchField("product", "Chocolate sandwich cookies"),
            WatchField("reason", "May contain undeclared milk"),
        )
        val matches = WatchMatcher.matches(listOf("milk"), fields)

        assertEquals(1, matches.size)
        assertEquals("reason", matches.single().field)
        assertEquals("May contain undeclared milk", matches.single().evidence)
    }

    @Test
    fun `compatibility characters are normalized`() {
        assertTrue(WatchMatcher.contains("ＦＤＡ", "FDA announcement"))
    }
}
