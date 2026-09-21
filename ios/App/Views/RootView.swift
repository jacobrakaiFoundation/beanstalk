import SwiftData
import SwiftUI

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var notifications: NotificationRegistrationService
    @Query(sort: \WatchTermEntity.createdAt) private var watchTerms: [WatchTermEntity]

    var body: some View {
        TabView(selection: $router.selectedTab) {
            RecallsView()
                .tabItem { Label("Recalls", systemImage: "exclamationmark.triangle") }
                .tag(AppTab.recalls)
                .accessibilityLabel("Recalls")

            SavedView()
                .tabItem { Label("Saved", systemImage: "bookmark") }
                .tag(AppTab.saved)
                .accessibilityLabel("Saved")

            WatchlistView()
                .tabItem { Label("Watchlist", systemImage: "bell") }
                .tag(AppTab.watchlist)
                .accessibilityLabel("Watchlist")

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(AppTab.settings)
                .accessibilityLabel("Settings")
        }
        .accessibilityReduceMotionAware()
        .supportsLargerText()
        .task {
            await notifications.synchronize(terms: watchTerms.map(\.normalizedTerm))
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            Task { await notifications.synchronize(terms: watchTerms.map(\.normalizedTerm)) }
        }
        .sheet(item: $router.pendingNotice) { pending in
            RemoteNoticeDetailView(
                noticeID: pending.noticeID,
                matchedTerm: pending.matchedTerm,
                matchedField: pending.matchedField
            )
        }
    }
}
