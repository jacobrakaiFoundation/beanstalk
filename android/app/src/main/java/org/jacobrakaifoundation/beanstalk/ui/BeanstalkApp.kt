package org.jacobrakaifoundation.beanstalk.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import org.jacobrakaifoundation.beanstalk.notifications.AlertControlPolicy
import org.jacobrakaifoundation.beanstalk.ui.theme.BeanstalkTheme

private enum class AppTab(
    val route: String,
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
) {
    RECALLS("recalls", "Recalls", Icons.Outlined.WarningAmber),
    SAVED("saved", "Saved", Icons.Outlined.BookmarkBorder),
    WATCHLIST("watchlist", "Watchlist", Icons.Outlined.NotificationsNone),
    SETTINGS("settings", "Settings", Icons.Outlined.Settings),
}

private const val NOTICE_DETAIL = "notice-detail"
private const val ENFORCEMENT_DETAIL = "enforcement-detail"

private fun NavHostController.openTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

@Composable
fun BeanstalkApp(viewModel: BeanstalkViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val navigation = rememberNavController()
    val backStack by navigation.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) viewModel.enableNotifications() else viewModel.notificationPermissionDenied()
    }
    val requestNotifications = {
        val alerts = state.notificationState
        if (AlertControlPolicy.shouldOfferEnable(alerts.alertsEnabled, alerts.alertsAvailable)) {
            if (Build.VERSION.SDK_INT >= 33) permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            else viewModel.enableNotifications()
        }
    }

    LaunchedEffect(state.pendingNotificationNavigation) {
        state.pendingNotificationNavigation?.let { generation ->
            if (viewModel.consumeNotificationNavigation(generation)) {
                navigation.navigate(NOTICE_DETAIL) { launchSingleTop = true }
            }
        }
    }

    BeanstalkTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            Scaffold(
                contentWindowInsets = WindowInsets(0),
                bottomBar = {
                    if (AppTab.entries.any { it.route == currentRoute }) {
                        NavigationBar {
                            AppTab.entries.forEach { tab ->
                                NavigationBarItem(
                                    selected = currentRoute == tab.route,
                                    onClick = { navigation.openTab(tab.route) },
                                    icon = { Icon(tab.icon, contentDescription = null) },
                                    label = { Text(tab.label) },
                                )
                            }
                        }
                    }
                },
            ) { contentPadding ->
                NavHost(
                    navController = navigation,
                    startDestination = AppTab.RECALLS.route,
                    modifier = Modifier.padding(contentPadding),
                ) {
                    composable(AppTab.RECALLS.route) {
                        RecallsScreen(
                            state = state,
                            onModeChange = viewModel::setMode,
                            onQueryChange = viewModel::setQuery,
                            onClassificationChange = viewModel::setClassification,
                            onStatusChange = viewModel::setStatus,
                            onSearch = viewModel::reload,
                            onLoadMore = viewModel::loadMore,
                            onRecord = {
                                viewModel.openRecord(it)
                                navigation.navigate(ENFORCEMENT_DETAIL)
                            },
                        )
                    }
                    composable(AppTab.SAVED.route) {
                        SavedScreen(
                            state = state,
                            onOpen = { item ->
                                if (viewModel.openSaved(item)) {
                                    navigation.navigate(
                                        if (item.kind == org.jacobrakaifoundation.beanstalk.data.model.SavedRecallKind.NOTICE) {
                                            NOTICE_DETAIL
                                        } else {
                                            ENFORCEMENT_DETAIL
                                        },
                                    )
                                }
                            },
                            onRemove = viewModel::removeSaved,
                        )
                    }
                    composable(AppTab.WATCHLIST.route) {
                        WatchlistScreen(
                            state = state,
                            onDismiss = { navigation.openTab(AppTab.RECALLS.route) },
                            onAddTerm = viewModel::addWatchTerm,
                            onRemoveTerm = viewModel::removeWatchTerm,
                            onRequestNotifications = requestNotifications,
                            onNotice = { notice, term, field ->
                                viewModel.openNotice(notice, term, field)
                                navigation.navigate(NOTICE_DETAIL)
                            },
                        )
                    }
                    composable(AppTab.SETTINGS.route) {
                        SettingsScreen(
                            state = state,
                            onRequestNotifications = requestNotifications,
                            onDisableNotifications = viewModel::disableNotifications,
                            onClearLocalData = viewModel::clearLocalData,
                        )
                    }
                    composable(NOTICE_DETAIL) {
                        NoticeDetailScreen(
                            state = state,
                            onBack = navigation::popBackStack,
                            onToggleSave = viewModel::toggleSaveNotice,
                        )
                    }
                    composable(ENFORCEMENT_DETAIL) {
                        EnforcementDetailScreen(
                            state = state,
                            onBack = navigation::popBackStack,
                            onToggleSave = viewModel::toggleSaveRecord,
                        )
                    }
                }
            }
        }
    }
}
