import SwiftUI

enum AppTab: Hashable {
    case recalls
    case saved
    case watchlist
    case settings
}

struct RootView: View {
    @State private var selectedTab: AppTab = .recalls

    var body: some View {
        TabView(selection: $selectedTab) {
            RecallsView()
                .tabItem { Label("Recalls", systemImage: "exclamationmark.triangle") }
                .tag(AppTab.recalls)
                .accessibilityLabel("Recalls")

            SavedView()
                .tabItem { Label("Saved", systemImage: "bookmark") }
                .tag(AppTab.saved)
                .accessibilityLabel("Saved")

            WatchlistView()
                .tabItem { Label("Watchlist", systemImage: "eye") }
                .tag(AppTab.watchlist)
                .accessibilityLabel("Watchlist")

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(AppTab.settings)
                .accessibilityLabel("Settings")
        }
        .accessibilityReduceMotionAware()
        .supportsLargerText()
    }
}
