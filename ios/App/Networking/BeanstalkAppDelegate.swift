import BeanstalkCore
import UIKit
import UserNotifications

final class BeanstalkAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        if let payload = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            publishNotice(from: payload)
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(
            name: .didRegisterForRemoteNotifications,
            object: nil,
            userInfo: ["deviceToken": token]
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .remoteNotificationRegistrationFailed,
            object: nil,
            userInfo: ["message": AlertControlPolicy.pushRegistrationFailedMessage]
        )
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        publishNotice(from: response.notification.request.content.userInfo)
    }

    private func publishNotice(from payload: [AnyHashable: Any]) {
        guard let noticeID = payload["noticeId"] as? String, !noticeID.isEmpty else { return }
        let pending = PendingNotificationPayload(
            noticeID: noticeID,
            matchedTerm: (payload["matchedTerm"] as? String).flatMap { $0.isEmpty ? nil : $0 },
            matchedField: (payload["matchedField"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        )
        try? PendingNotificationBuffer.shared.store(pending)
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .didOpenRecallNotice,
                object: nil,
                userInfo: [
                    "noticeId": noticeID,
                    "matchedTerm": payload["matchedTerm"] as? String ?? "",
                    "matchedField": payload["matchedField"] as? String ?? ""
                ]
            )
        }
    }
}
