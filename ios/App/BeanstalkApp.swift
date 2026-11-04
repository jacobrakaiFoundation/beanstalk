import SwiftData
import SwiftUI

@main
struct BeanstalkApp: App {

    private let modelContainer: ModelContainer = {
        do {
            return try ModelContainer(for: SavedRecallItem.self, WatchTermEntity.self)
        } catch {
            fatalError("Unable to create Beanstalk data store.")
        }
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
                .tint(Color("AccentColor"))
                .task { await runNegativeControlIfRequested() }
        }
        .modelContainer(modelContainer)
    }

    /// TEMP proof hook, removed before merge. Debug builds only, and only when
    /// launched with -BeanstalkNegativeControl. One GET, no body.
    private func runNegativeControlIfRequested() async {
        #if DEBUG
        guard ProcessInfo.processInfo.arguments.contains("-BeanstalkNegativeControl") else { return }
        guard let url = URL(string: "https://jacobrakai.org/v1/devices") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.httpBody = nil
        _ = try? await URLSession.shared.data(for: request)
        #endif
    }
}
