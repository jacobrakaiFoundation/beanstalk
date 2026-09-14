import SwiftData
import SwiftUI

@main
struct BeanstalkApp: App {
    @UIApplicationDelegateAdaptor(BeanstalkAppDelegate.self) private var appDelegate
    @StateObject private var router = AppRouter()
    @StateObject private var notificationService = NotificationRegistrationService()

    private let modelContainer: ModelContainer = {
        do {
            return try ModelContainer(for: SavedRecallItem.self, WatchTermEntity.self)
        } catch {
            fatalError("Unable to create Beanstalk data store: \(error.localizedDescription)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(router)
                .environmentObject(notificationService)
                .tint(Color("AccentColor"))
        }
        .modelContainer(modelContainer)
    }
}
