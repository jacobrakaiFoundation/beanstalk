package org.jacobrakaifoundation.beanstalk.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val LightColors = lightColorScheme(
    primary = Color(0xFF315B43),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD2E8D6),
    onPrimaryContainer = Color(0xFF102B1C),
    secondary = Color(0xFF53614E),
    onSecondary = Color.White,
    background = Color(0xFFF8F6EE),
    onBackground = Color(0xFF1B2D23),
    surface = Color(0xFFFFFDF7),
    onSurface = Color(0xFF1B2D23),
    surfaceVariant = Color(0xFFE7E9DE),
    onSurfaceVariant = Color(0xFF3D503D),
    outline = Color(0xFF667260),
    error = Color(0xFF9C2A25),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFAFCFB3),
    onPrimary = Color(0xFF153823),
    primaryContainer = Color(0xFF294D37),
    onPrimaryContainer = Color(0xFFD2E8D6),
    secondary = Color(0xFFC5CCBD),
    onSecondary = Color(0xFF293C2E),
    background = Color(0xFF111E17),
    onBackground = Color(0xFFF1F3EA),
    surface = Color(0xFF1B2D23),
    onSurface = Color(0xFFF1F3EA),
    surfaceVariant = Color(0xFF293C2E),
    onSurfaceVariant = Color(0xFFC5CCBD),
    outline = Color(0xFFA0AD9A),
    error = Color(0xFFFFB4AB),
)

private val BeanstalkTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 36.sp,
        lineHeight = 42.sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 23.sp,
        lineHeight = 29.sp,
    ),
)

@Composable
fun BeanstalkTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        typography = BeanstalkTypography,
        content = content,
    )
}
