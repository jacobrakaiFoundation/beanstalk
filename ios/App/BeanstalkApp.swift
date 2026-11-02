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
                .task {
                    await LegacyRegistrationCleanup.run(
                        baseURL: AppConfiguration.backendBaseURL,
                        cacheDirectory: APIClient.cacheDirectory
                    )
                }
        }
        .modelContainer(modelContainer)
    }
}
