package org.jacobrakaifoundation.beanstalk.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Paper = Color(0xFFF8F6EE)
private val Green = Color(0xFF1D4535)
private val Ink = Color(0xFF111E17)

private val LightColors = lightColorScheme(
    primary = Green,
    onPrimary = Paper,
    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = Color(0xFFE8E4D4),
    onSurfaceVariant = Ink,
    errorContainer = Color(0xFFF4D6D6),
    onErrorContainer = Color(0xFF4A1515),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF8FBF9F),
    onPrimary = Ink,
    background = Ink,
    onBackground = Paper,
    surface = Color(0xFF18261E),
    onSurface = Paper,
    surfaceVariant = Color(0xFF24352C),
    onSurfaceVariant = Paper,
    errorContainer = Color(0xFF5A2A2A),
    onErrorContainer = Color(0xFFF4D6D6),
)

@Composable
fun BeanstalkTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
